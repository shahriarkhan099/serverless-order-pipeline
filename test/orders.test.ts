import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { InvalidOrder } from "../src/domain/order.js";
import { placeOrder } from "../src/application/place-order.js";
import { ordersTopic } from "../src/application/ports.js";
import { prisma } from "../src/infrastructure/db.js";
import { PrismaOrderStore, writeOrderWithOutbox } from "../src/infrastructure/prisma-order-store.js";
import { PrismaOutbox } from "../src/infrastructure/prisma-outbox.js";

const store = new PrismaOrderStore(prisma);
const outbox = new PrismaOutbox(prisma);

beforeEach(async () => {
  await prisma.outbox.deleteMany();
  await prisma.order.deleteMany();
});

after(async () => {
  await prisma.$disconnect();
});

test("a failed transaction leaves no order and no outbox row", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await writeOrderWithOutbox(tx, {
        id: "ord_rollback",
        sku: "mug",
        qty: 1,
        idempotencyKey: "rollback-1",
      });
      throw new Error("nope");
    }),
    /nope/,
  );
  assert.equal(await prisma.order.count(), 0);
  assert.equal(await prisma.outbox.count(), 0);
});

test("one idempotency key creates one order under concurrency", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      placeOrder(store, { sku: "mug", qty: 1, idempotencyKey: "same-key" }),
    ),
  );
  const orders = await prisma.order.findMany();
  const rows = await prisma.outbox.findMany();
  assert.equal(orders.length, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.aggregateId, orders[0]?.id);
  assert.ok(results.every((result) => result.id === orders[0]?.id));
});

test("qty below 1 does not write", async () => {
  await assert.rejects(
    () => placeOrder(store, { sku: "mug", qty: 0, idempotencyKey: "bad-qty" }),
    InvalidOrder,
  );
  assert.equal(await prisma.order.count(), 0);
});

test("publisher stamps a row only after the send succeeds", async () => {
  const order = await placeOrder(store, { sku: "mug", qty: 2, idempotencyKey: "pub-1" });
  const sent: { topic: string; key?: string; value: string }[] = [];

  const count = await outbox.publishPending({
    async send(batch) {
      for (const message of batch.messages) sent.push({ topic: batch.topic, key: message.key, value: message.value });
    },
  });

  assert.equal(count, 1);
  assert.equal(sent[0]?.topic, ordersTopic);
  assert.equal(sent[0]?.key, order.id);
  const event = JSON.parse(sent[0]?.value ?? "{}");
  assert.equal(event.orderId, order.id);
  assert.equal(event.sku, "mug");
  assert.equal(event.qty, 2);
  assert.ok((await prisma.outbox.findFirstOrThrow()).publishedAt);
});

test("a rejected send leaves the outbox row unpublished", async () => {
  await placeOrder(store, { sku: "mug", qty: 1, idempotencyKey: "pub-2" });
  await assert.rejects(
    () =>
      outbox.publishPending({
        async send() {
          throw new Error("broker down");
        },
      }),
    /broker down/,
  );
  assert.equal((await prisma.outbox.findFirstOrThrow()).publishedAt, null);
});
