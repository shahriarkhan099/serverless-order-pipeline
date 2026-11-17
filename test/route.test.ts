import assert from "node:assert/strict";
import { test } from "node:test";
import { queueFor } from "../src/application/route.js";

test("placed and failed orders use different queues", () => {
  assert.equal(queueFor("order.placed"), "order-work");
  assert.equal(queueFor("order.failed"), "order-failed");
  assert.equal(queueFor("order.cancelled"), null);
});
