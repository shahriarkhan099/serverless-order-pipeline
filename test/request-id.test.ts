import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/interfaces/http/app.js";

test("an incoming request id is echoed", async () => {
  const app = createApp(async (input) => ({
    id: "ord_1",
    sku: input.sku,
    qty: input.qty,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date(),
    created: true,
  }));
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { "x-request-id": "req_9" } });
    assert.equal(response.headers.get("x-request-id"), "req_9");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
