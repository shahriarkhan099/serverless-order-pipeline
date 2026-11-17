import assert from "node:assert/strict";
import { test } from "node:test";
import { toWorkItem } from "../src/application/forward.js";

test("an order.placed event becomes a work message", () => {
  const item = toWorkItem({ id: "1", type: "order.placed", orderId: "ord_1" });
  assert.equal(item?.queue, "order-work");
  assert.equal(JSON.parse(item!.body).orderId, "ord_1");
});

test("a failed order is routed to its own queue", () => {
  const item = toWorkItem({ id: "2", type: "order.failed", orderId: "ord_2" });
  assert.equal(item?.queue, "order-failed");
});

test("anything else is dropped", () => {
  assert.equal(toWorkItem({ type: "order.cancelled" }), null);
  assert.equal(toWorkItem(null), null);
  assert.equal(toWorkItem({ id: "", type: "order.placed", orderId: "ord_1" }), null);
  assert.equal(toWorkItem({ id: "1", type: "order.placed", orderId: "" }), null);
  assert.equal(toWorkItem({ id: 1, type: "order.placed", orderId: "ord_1" }), null);
});
