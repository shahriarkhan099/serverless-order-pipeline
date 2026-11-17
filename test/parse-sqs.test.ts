import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSqsBody } from "../src/application/parse-sqs.js";

test("a work message round-trips", () => {
  const message = parseSqsBody(JSON.stringify({ id: "9", type: "order.placed", orderId: "ord_9" }));
  assert.deepEqual(message, { id: "9", type: "order.placed", orderId: "ord_9" });
});

test("junk is ignored", () => {
  assert.equal(parseSqsBody("not-json"), null);
  assert.equal(parseSqsBody(JSON.stringify({ type: "other" })), null);
});
