import assert from "node:assert/strict";
import { test } from "node:test";
import { readConfig } from "../src/config.js";

test("the outbox batch defaults to 20", () => {
  assert.equal(readConfig({}).outboxBatch, 20);
});

test("a zero batch is rejected", () => {
  assert.throws(() => readConfig({ OUTBOX_BATCH: "0" }), /OUTBOX_BATCH/);
});
