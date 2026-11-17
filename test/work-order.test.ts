import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryEffects } from "../src/application/effects.js";
import { workOrder } from "../src/application/work-order.js";

const message = { id: "1", type: "order.placed", orderId: "ord_1" };

test("the side effect runs only for the winning claim", async () => {
  const effects = new MemoryEffects();
  let runs = 0;
  const apply = async () => {
    runs += 1;
  };
  assert.equal(await workOrder(effects, message, apply), "applied");
  assert.equal(await workOrder(effects, message, apply), "duplicate");
  assert.equal(runs, 1);
});
