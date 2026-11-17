import assert from "node:assert/strict";
import { test } from "node:test";
import { assertOrderInput, InvalidOrder } from "../src/domain/order.js";

test("a sku longer than 80 characters is rejected", () => {
  assert.throws(
    () => assertOrderInput({ sku: "x".repeat(81), qty: 1, idempotencyKey: "k" }),
    InvalidOrder,
  );
});
