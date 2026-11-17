import assert from "node:assert/strict";
import { test } from "node:test";
import { partialBatchFailure } from "../src/interfaces/lambda/failures.js";

test("failed message ids become SQS batch item failures", () => {
  assert.deepEqual(partialBatchFailure(["m1", "m2"]), {
    batchItemFailures: [{ itemIdentifier: "m1" }, { itemIdentifier: "m2" }],
  });
});
