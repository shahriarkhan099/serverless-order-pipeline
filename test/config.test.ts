import assert from "node:assert/strict";
import { test } from "node:test";
import { readConfig } from "../src/config.js";

test("the outbox batch defaults to 20", () => {
  assert.equal(readConfig({}).outboxBatch, 20);
});

test("a zero batch is rejected", () => {
  assert.throws(() => readConfig({ OUTBOX_BATCH: "0" }), /OUTBOX_BATCH/);
  assert.throws(() => readConfig({ OUTBOX_BATCH: "1.5" }), /OUTBOX_BATCH/);
});

test("brokers are trimmed and an empty list is rejected", () => {
  assert.deepEqual(readConfig({ KAFKA_BROKERS: " localhost:9092 , kafka:9092 " }).kafkaBrokers, [
    "localhost:9092",
    "kafka:9092",
  ]);
  assert.throws(() => readConfig({ KAFKA_BROKERS: " , " }), /KAFKA_BROKERS/);
});

test("the port has to be a positive integer", () => {
  assert.equal(readConfig({}).port, 3001);
  assert.throws(() => readConfig({ PORT: "0" }), /PORT/);
  assert.throws(() => readConfig({ PORT: "3001.5" }), /PORT/);
  assert.throws(() => readConfig({ PORT: "-1" }), /PORT/);
});
