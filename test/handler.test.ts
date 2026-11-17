import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryEffects } from "../src/application/effects.js";
import { handleOrderWork } from "../src/interfaces/lambda/handler.js";

test("a thrown side effect is reported as a batch failure", async () => {
  const result = await handleOrderWork(
    { Records: [{ messageId: "m1", body: JSON.stringify({ id: "1", type: "order.placed", orderId: "ord_1" }) }] },
    new MemoryEffects(),
    async () => {
      throw new Error("downstream");
    },
  );
  assert.deepEqual(result.batchItemFailures, [{ itemIdentifier: "m1" }]);
});

test("a duplicate claim is a success", async () => {
  const effects = new MemoryEffects();
  await effects.claim("1");
  const result = await handleOrderWork(
    { Records: [{ messageId: "m1", body: JSON.stringify({ id: "1", type: "order.placed", orderId: "ord_1" }) }] },
    effects,
    async () => {
      throw new Error("should not run");
    },
  );
  assert.deepEqual(result.batchItemFailures, []);
});
