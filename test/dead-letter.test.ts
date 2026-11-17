import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldDeadLetter } from "../src/application/dead-letter.js";

test("the sixth receive is the dead-letter point", () => {
  assert.equal(shouldDeadLetter(5), false);
  assert.equal(shouldDeadLetter(6), true);
});
