import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { ConditionalCheckFailedException, DeleteItemCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { MemoryEffects } from "../src/application/effects.js";
import { assertOrderInput } from "../src/domain/order.js";
import { shouldDeadLetter } from "../src/application/dead-letter.js";
import { parseSqsBody } from "../src/application/parse-sqs.js";
import { PrismaOrderStore } from "../src/infrastructure/prisma-order-store.js";
import { PrismaOutbox } from "../src/infrastructure/prisma-outbox.js";
import { createKafkaSender } from "../src/infrastructure/kafka-sender.js";
import { dynamoEffects } from "../src/infrastructure/dynamo-effects.js";
import { ordersTopic } from "../src/application/ports.js";
import { clientStatus, createApp } from "../src/interfaces/http/app.js";
import { handler } from "../src/interfaces/lambda/entry.js";
import { handleOrderWork } from "../src/interfaces/lambda/handler.js";
import { partialBatchFailure } from "../src/interfaces/lambda/failures.js";
import { forwardCommand, runForward } from "../src/forward-main.js";
import { MemoryQueue } from "../src/infrastructure/memory-queue.js";
import { publishOutbox, runPublisher, selectPublisher } from "../src/publish-main.js";
import { launchIfMain } from "../src/runtime.js";
import { startOrders } from "../src/main.js";

const saved = {
  id: "ord_1",
  sku: "mug",
  qty: 1,
  idempotencyKey: "key-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("order rules reject every invalid shape and trim the rest", () => {
  assert.throws(() => assertOrderInput({ sku: "  ", qty: 1, idempotencyKey: "k" }), /sku is required/);
  assert.throws(() => assertOrderInput({ sku: "x".repeat(81), qty: 1, idempotencyKey: "k" }), /too long/);
  assert.throws(() => assertOrderInput({ sku: "mug", qty: 1.5, idempotencyKey: "k" }), /qty/);
  assert.throws(() => assertOrderInput({ sku: "mug", qty: -1, idempotencyKey: "k" }), /qty/);
  assert.throws(() => assertOrderInput({ sku: "mug", qty: 1, idempotencyKey: "  " }), /idempotencyKey/);
  assert.deepEqual(assertOrderInput({ sku: " mug ", qty: 2, idempotencyKey: " k " }), {
    sku: "mug",
    qty: 2,
    idempotencyKey: "k",
  });
});

test("dead-letter comparison rejects non-integers and honors a custom max", () => {
  assert.equal(shouldDeadLetter(Number.NaN), false);
  assert.equal(shouldDeadLetter(1.5), false);
  assert.equal(shouldDeadLetter(-1), false);
  assert.equal(shouldDeadLetter(2, 1), true);
});

test("sqs parsing drops every malformed body", () => {
  assert.equal(parseSqsBody("not-json"), null);
  assert.equal(parseSqsBody("null"), null);
  assert.equal(parseSqsBody("[]"), null);
  assert.equal(parseSqsBody(JSON.stringify({ type: "order.failed", id: "1", orderId: "o" })), null);
  assert.equal(parseSqsBody(JSON.stringify({ type: "order.placed", orderId: "o" })), null);
  assert.equal(parseSqsBody(JSON.stringify({ type: "order.placed", id: 1, orderId: "o" })), null);
  assert.equal(parseSqsBody(JSON.stringify({ type: "order.placed", id: "1" })), null);
  assert.deepEqual(parseSqsBody(JSON.stringify({ id: "1", type: "order.placed", orderId: "ord_1" })), {
    id: "1",
    type: "order.placed",
    orderId: "ord_1",
  });
});

test("partial batch failure allows an empty list", () => {
  assert.deepEqual(partialBatchFailure([]), { batchItemFailures: [] });
});

test("the worker skips junk, fails past five receives, and retries after a release", async () => {
  const skipped = await handleOrderWork({ Records: [{ messageId: "m", body: "nope" }] }, new MemoryEffects(), async () => {});
  assert.deepEqual(skipped.batchItemFailures, []);
  const empty = await handleOrderWork({}, new MemoryEffects(), async () => {});
  assert.deepEqual(empty.batchItemFailures, []);
  const dead = await handleOrderWork(
    { Records: [{ messageId: "m", body: "{}", attributes: { ApproximateReceiveCount: "nope" } }] },
    new MemoryEffects(),
    async () => {
      throw new Error("should not run");
    },
  );
  assert.deepEqual(dead.batchItemFailures, []);
  const dropped = await handleOrderWork(
    { Records: [{ messageId: "late", body: "{}", attributes: { ApproximateReceiveCount: "6" } }] },
    new MemoryEffects(),
    async () => {
      throw new Error("should not run");
    },
  );
  assert.deepEqual(dropped.batchItemFailures, [{ itemIdentifier: "late" }]);

  const effects = new MemoryEffects();
  let runs = 0;
  const event = { Records: [{ messageId: "m1", body: JSON.stringify({ id: "1", type: "order.placed", orderId: "ord_1" }) }] };
  const first = await handleOrderWork(event, effects, async () => {
    runs += 1;
    if (runs === 1) throw new Error("downstream");
  });
  const second = await handleOrderWork(event, effects, async () => {
    runs += 1;
  });
  assert.deepEqual(first.batchItemFailures, [{ itemIdentifier: "m1" }]);
  assert.deepEqual(second.batchItemFailures, []);
  assert.equal(runs, 2);
});

test("dynamo release deletes the item and other errors propagate", async () => {
  const names: string[] = [];
  const client = {
    async send(command: { constructor: { name: string } }) {
      names.push(command.constructor.name);
      if (command instanceof ConditionalCheckFailedException) return;
    },
  };
  const effects = dynamoEffects(client as never, "order-effects");
  await effects.release("evt_1");
  assert.ok(names.includes(DeleteItemCommand.name) || names.includes("DeleteItemCommand"));
  const failing = dynamoEffects({ async send() { throw new Error("throttle"); } } as never, "order-effects");
  await assert.rejects(() => failing.claim("evt_1"), /throttle/);
});

test("the lambda entry claims through the supplied client and logs the order", async () => {
  const previous = process.env.EFFECT_TABLE;
  process.env.EFFECT_TABLE = "custom-effects";
  const lines: string[] = [];
  const original = console.log;
  console.log = (line?: unknown) => lines.push(String(line));
  try {
    const sent: { TableName?: string }[] = [];
    const client = {
      async send(command: { input?: { TableName?: string } }) {
        sent.push(command.input ?? {});
      },
    };
    const result = await handler(
      { Records: [{ messageId: "m1", body: JSON.stringify({ id: "9", type: "order.placed", orderId: "ord_9" }) }] },
      client as never,
    );
    assert.deepEqual(result.batchItemFailures, []);
    assert.equal(sent[0]?.TableName, "custom-effects");
    assert.equal(lines.at(-1), "applied ord_9");
    delete process.env.EFFECT_TABLE;
    const empty = await handler({});
    assert.deepEqual(empty.batchItemFailures, []);
    assert.ok(new DynamoDBClient({}));
  } finally {
    console.log = original;
    if (previous === undefined) delete process.env.EFFECT_TABLE;
    else process.env.EFFECT_TABLE = previous;
  }
});

test("http orders cover bad bodies, header precedence, and unexpected failures", async () => {
  const seen: { sku: string; qty: number; idempotencyKey: string }[] = [];
  await withServer(async (input) => {
    if (input.sku === "boom") throw new Error("db down");
    if (input.sku === "text") throw "x";
    if (input.sku === "auth") throw { status: 401 };
    const valid = assertOrderInput(input);
    seen.push(valid);
    return {
      id: "ord_1",
      sku: valid.sku,
      qty: valid.qty,
      idempotencyKey: valid.idempotencyKey,
      createdAt: saved.createdAt,
      created: valid.idempotencyKey !== "replay",
    };
  }, async (port) => {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-powered-by"), null);
    const generated = health.headers.get("x-request-id");
    assert.match(generated ?? "", /^[0-9a-f-]{36}$/);
    const blank = await fetch(`http://127.0.0.1:${port}/health`, { headers: { "x-request-id": "   " } });
    assert.match(blank.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);
    const emptyHeader = await fetch(`http://127.0.0.1:${port}/health`, { headers: { "x-request-id": "" } });
    assert.match(emptyHeader.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);

    const bodyWins = await post(port, { sku: "mug", qty: 1, idempotencyKey: "from-body" }, { "idempotency-key": "from-header" });
    assert.equal(bodyWins.status, 201);
    assert.equal(bodyWins.body.idempotencyKey, "from-body");
    const headerOnly = await post(port, { sku: "mug", qty: 1 }, { "idempotency-key": "from-header" });
    assert.equal(headerOnly.body.idempotencyKey, "from-header");
    const replay = await post(port, { sku: "mug", qty: 1, idempotencyKey: "replay" });
    assert.equal(replay.status, 200);

    assert.equal((await post(port, null)).status, 400);
    assert.equal((await post(port, [])).status, 400);
    assert.equal((await post(port, { sku: 1, qty: "1", idempotencyKey: "k" })).status, 400);
    assert.equal((await post(port, { sku: "mug", qty: 1 })).status, 400);
    const invalid = await post(port, { sku: "  ", qty: 1, idempotencyKey: "k" });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, "sku is required");
    assert.equal((await postRaw(port, "{")).status, 400);
    const failed = await post(port, { sku: "boom", qty: 1, idempotencyKey: "k" });
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error, "failed to place order");
    assert.equal((await post(port, { sku: "text", qty: 1, idempotencyKey: "k" })).status, 500);
    assert.equal((await post(port, { sku: "auth", qty: 1, idempotencyKey: "k" })).status, 500);
    assert.equal(clientStatus(null), undefined);
    assert.equal(clientStatus("x"), undefined);
    assert.equal(clientStatus({ status: 400 }), 400);
  });
  assert.ok(seen.length > 0);
});

test("the order store returns the winner and rethrows unrelated failures", async () => {
  const store = new PrismaOrderStore(fakeOrders({ existing: saved }));
  const replay = await store.place({ sku: "mug", qty: 1, idempotencyKey: "key-1" });
  assert.equal(replay.created, false);
  assert.equal(replay.id, "ord_1");

  const created = await new PrismaOrderStore(fakeOrders({})).place({ sku: "mug", qty: 1, idempotencyKey: "key-2" });
  assert.equal(created.created, true);
  assert.equal(created.sku, "mug");

  const raced = await new PrismaOrderStore(fakeOrders({ throwValue: { code: "P2002" }, winner: saved })).place({
    sku: "mug",
    qty: 1,
    idempotencyKey: "key-1",
  });
  assert.equal(raced.created, false);

  await assert.rejects(
    () => new PrismaOrderStore(fakeOrders({ throwValue: { code: "P2002" }, winner: null })).place({ sku: "mug", qty: 1, idempotencyKey: "missing" }),
    (err: unknown) => (err as { code?: string }).code === "P2002",
  );
  await assert.rejects(
    () => new PrismaOrderStore(fakeOrders({ throwValue: new Error("db down") })).place({ sku: "mug", qty: 1, idempotencyKey: "k" }),
    /db down/,
  );
  for (const throwValue of [null, "x", {}, { code: "NO" }]) {
    await assert.rejects(() => new PrismaOrderStore(fakeOrders({ throwValue })).place({ sku: "mug", qty: 1, idempotencyKey: "k" }));
  }
});

test("the outbox publisher shapes each id and ignores a bad payload", async () => {
  const sent: { topic: string; value: string }[] = [];
  const sender = {
    async send(batch: { topic: string; messages: { value: string }[] }) {
      for (const message of batch.messages) sent.push({ topic: batch.topic, value: message.value });
    },
  };
  const outbox = new PrismaOutbox(fakeOutbox([
    { id: 10n, aggregate_id: "ord_a", type: "order.placed", payload: { sku: "mug", qty: 1 } },
    { id: 11, aggregate_id: "ord_b", type: "order.placed", payload: ["nope"] },
    { id: "12", aggregate_id: "ord_c", type: "order.placed", payload: null },
  ]) as unknown as PrismaClient);
  assert.equal(await outbox.publishPending(sender), 3);
  assert.equal(sent[0]?.topic, ordersTopic);
  assert.match(sent[0]?.value ?? "", /mug/);
  assert.equal(JSON.parse(sent[1]?.value ?? "{}").sku, undefined);
  assert.equal(await new PrismaOutbox(fakeOutbox([]) as unknown as PrismaClient).publishPending(sender), 0);
  await assert.rejects(
    () => new PrismaOutbox(fakeOutbox([{ id: 1n, aggregate_id: "ord_d", type: "order.placed", payload: { sku: "mug", qty: 1 } }]) as unknown as PrismaClient).publishPending({
      async send() {
        throw new Error("down");
      },
    }),
    /down/,
  );
});

test("the kafka sender uses a supplied producer and can construct its own", async () => {
  const batches: { topic: string }[] = [];
  let connected = false;
  let disconnected = false;
  const kafka = createKafkaSender(["localhost:9092"], {
    async send(batch: { topic: string }) {
      batches.push({ topic: batch.topic });
      return [];
    },
    async connect() {
      connected = true;
    },
    async disconnect() {
      disconnected = true;
    },
  } as never);
  await kafka.connect();
  await kafka.sender.send({ topic: "orders.events", messages: [] });
  await kafka.disconnect();
  assert.equal(connected && disconnected && batches[0]?.topic === "orders.events", true);
  createKafkaSender(["localhost:9092"]);
});

test("publishing logs the count and still disconnects when the broker fails", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (line?: unknown) => lines.push(String(line));
  try {
    assert.equal(
      await publishOutbox({
        async connect() {},
        async publish() {
          return 4;
        },
        async disconnect() {},
      }),
      undefined,
    );
    assert.equal(lines.at(-1), "published 4");
    const logged: string[] = [];
    await publishOutbox({
      async connect() {},
      async publish() {
        return 1;
      },
      async disconnect() {},
      log: (message) => logged.push(message),
    });
    assert.deepEqual(logged, ["published 1"]);
  } finally {
    console.log = original;
  }

  let disconnected = false;
  await assert.rejects(
    () => publishOutbox({
      async connect() {
        throw new Error("no broker");
      },
      async publish() {
        return 1;
      },
      async disconnect() {
        disconnected = true;
      },
    }),
    /no broker/,
  );
  assert.equal(disconnected, true);
  disconnected = false;
  await assert.rejects(
    () => publishOutbox({
      async connect() {},
      async publish() {
        throw new Error("send failed");
      },
      async disconnect() {
        disconnected = true;
      },
    }),
    /send failed/,
  );
  assert.equal(disconnected, true);
});

test("publisher parts build a client and the runner uses the parts it is given", async () => {
  const real = selectPublisher();
  assert.ok(real.config.kafkaBrokers.length > 0);
  const selected = selectPublisher(real);
  assert.equal(selected, real);
  let published = 0;
  await runPublisher({
    config: real.config,
    kafka: {
      sender: { async send() {} },
      async connect() {},
      async disconnect() {},
    },
    outbox: {
      async publishPending() {
        published += 1;
        return 2;
      },
    },
  } as never);
  assert.equal(published, 1);
});

test("the forward command reports usage, bad json, and a routed event", async () => {
  const lines: string[] = [];
  const write = {
    log: (message: string) => lines.push(`log ${message}`),
    error: (message: string) => lines.push(`error ${message}`),
  };
  assert.equal(await forwardCommand(undefined, undefined, write), 1);
  assert.match(lines[0] ?? "", /usage/);
  assert.equal(await forwardCommand("not-json", undefined, write), 1);
  assert.equal(await forwardCommand("null", undefined, write), 1);
  assert.equal(await forwardCommand("[]", undefined, write), 1);
  const queue = new MemoryQueue();
  assert.equal(
    await forwardCommand(JSON.stringify({ id: "1", type: "order.placed", orderId: "ord_1" }), queue, write),
    0,
  );
  assert.equal(queue.sent[0]?.queue, "order-work");
  const previousCode = process.exitCode;
  const previousArg = process.argv[2];
  process.argv[2] = JSON.stringify({ id: "3", type: "order.failed", orderId: "ord_3" });
  await runForward();
  assert.equal(process.exitCode, 0);
  process.argv[2] = previousArg;
  process.exitCode = previousCode;
  assert.equal(await forwardCommand(JSON.stringify({ id: "4", type: "order.placed", orderId: "ord_4" })), 0);
});

test("launchIfMain runs only the matching module and records a startup failure", async () => {
  const file = path.resolve("/tmp/orders-main.ts");
  const url = pathToFileURL(file).href;
  assert.equal(await launchIfMain(undefined, url, async () => {}), false);
  assert.equal(await launchIfMain("/somewhere/else.ts", url, async () => { throw new Error("no"); }), false);
  let ran = false;
  assert.equal(await launchIfMain(file, url, async () => { ran = true; }), true);
  assert.equal(ran, true);
  const previousCode = process.exitCode;
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (err?: unknown) => errors.push(err);
  try {
    assert.equal(await launchIfMain(file, url, async () => { throw new Error("boom"); }), false);
    assert.equal(process.exitCode, 1);
    assert.match(String(errors[0]), /boom/);
    assert.equal(await launchIfMain(file, url, () => { throw new Error("sync"); }), false);
  } finally {
    console.error = original;
    process.exitCode = previousCode;
  }
});

test("the api process serves health and shuts down", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (line?: unknown) => lines.push(String(line));
  const exits: number[] = [];
  const previousPort = process.env.PORT;
  process.env.PORT = "34521";
  try {
    const configured = await startOrders({ exit: (code) => exits.push(code) });
    assert.equal(configured.port, 34521);
    await configured.shutdown();
    const started = await startOrders({ port: 0, exit: (code) => exits.push(code) });
    const health = await fetch(`http://127.0.0.1:${started.port}/health`);
    assert.equal(health.status, 200);
    const created = await fetch(`http://127.0.0.1:${started.port}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sku: "mug", qty: 1, idempotencyKey: `scenario-${Date.now()}` }),
    });
    assert.equal(created.status, 201);
    await started.shutdown();
    assert.deepEqual(exits, [0, 0]);
    assert.match(lines.join("\n"), /orders listening on 34521/);
  } finally {
    console.log = original;
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
  }

  const realExit = process.exit;
  let code: number | undefined;
  process.exit = ((value?: number) => {
    code = value;
  }) as typeof process.exit;
  try {
    const started = await startOrders({ port: 0 });
    await started.shutdown();
    assert.equal(code, 0);
  } finally {
    process.exit = realExit;
  }
});

function fakeOrders(behavior: { existing?: typeof saved | null; throwValue?: unknown; winner?: typeof saved | null }) {
  let lookups = 0;
  return {
    order: {
      async findUnique() {
        lookups += 1;
        if (lookups === 1) return behavior.existing ?? null;
        return behavior.winner === undefined ? null : behavior.winner;
      },
    },
    async $transaction(fn: (tx: unknown) => Promise<unknown>) {
      if ("throwValue" in behavior) throw behavior.throwValue;
      return fn({
        order: {
          async create({ data }: { data: typeof saved }) {
            return { ...data, createdAt: saved.createdAt };
          },
        },
        outbox: { async create() { return {}; } },
      });
    },
  } as unknown as PrismaClient;
}

function fakeOutbox(rows: { id: bigint | number | string; aggregate_id: string; type: string; payload: unknown }[]) {
  return {
    async $transaction(fn: (tx: unknown) => Promise<unknown>) {
      return fn({
        async $queryRaw() {
          return rows;
        },
        outbox: { async updateMany() { return { count: rows.length }; } },
      });
    },
  };
}

async function withServer(place: Parameters<typeof createApp>[0], run: (port: number) => Promise<void>) {
  const server = createApp(place).listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    await run(port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function postRaw(port: number, raw: string) {
  const response = await fetch(`http://127.0.0.1:${port}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
  });
  return { status: response.status };
}

async function post(port: number, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as { idempotencyKey?: string; error?: string } : {} };
}
