import assert from "node:assert/strict";
import { test } from "node:test";
import { toWorkItem } from "../src/application/forward.js";

test("an order.placed event becomes a work message", () => {
  const item = toWorkItem({ id: "1", type: "order.placed", orderId: "ord_1" });
  assert.equal(item?.queue, "order-work");
  assert.equal(JSON.parse(item!.body).orderId, "ord_1");
});

test("anything else is dropped", () => {
  assert.equal(toWorkItem({ type: "order.cancelled" }), null);
});
