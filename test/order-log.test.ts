import assert from "node:assert/strict";
import { test } from "node:test";
import { orderAccessLine } from "../src/interfaces/http/order-log.js";

test("the access line names the status and the sku", () => {
  assert.equal(orderAccessLine(201, "mug"), "POST /orders 201 mug");
});
