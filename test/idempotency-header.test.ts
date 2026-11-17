import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/interfaces/http/app.js";

test("the Idempotency-Key header is used when the body omits it", async () => {
  const app = createApp(async (input) => ({
    id: "ord_1",
    sku: input.sku,
    qty: input.qty,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    created: true,
  }));
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "from-header" },
      body: JSON.stringify({ sku: "mug", qty: 1 }),
    });
    const body = (await response.json()) as { idempotencyKey: string };
    assert.equal(response.status, 201);
    assert.equal(body.idempotencyKey, "from-header");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
