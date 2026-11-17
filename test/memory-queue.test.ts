import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryQueue } from "../src/infrastructure/memory-queue.js";

test("send records the queue name and body", async () => {
  const queue = new MemoryQueue();
  await queue.send("order-work", "{\"id\":\"1\"}");
  assert.deepEqual(queue.sent, [{ queue: "order-work", body: "{\"id\":\"1\"}" }]);
});
