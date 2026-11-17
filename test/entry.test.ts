import assert from "node:assert/strict";
import { test } from "node:test";
import { handler } from "../src/interfaces/lambda/entry.js";

test("the lambda entry is a function", () => {
  assert.equal(typeof handler, "function");
});
