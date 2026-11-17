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

test("a failed side effect releases the claim so the retry can run", async () => {
  const effects = new MemoryEffects();
  let attempts = 0;
  const apply = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("downstream");
  };
  await assert.rejects(() => workOrder(effects, message, apply), /downstream/);
  assert.equal(await workOrder(effects, message, apply), "applied");
  assert.equal(attempts, 2);
});

test("a release failure still surfaces the side-effect error", async () => {
  const effects = {
    async claim() {
      return true;
    },
    async release() {
      throw new Error("release failed");
    },
  };
  await assert.rejects(() => workOrder(effects, message, applyBoom), /downstream/);
});

async function applyBoom() {
  throw new Error("downstream");
}
