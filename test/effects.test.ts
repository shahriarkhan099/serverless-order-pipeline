import assert from "node:assert/strict";
import { test } from "node:test";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { MemoryEffects } from "../src/application/effects.js";
import { dynamoEffects } from "../src/infrastructure/dynamo-effects.js";

test("a second claim for the same event id loses", async () => {
  const effects = new MemoryEffects();
  assert.equal(await effects.claim("evt_1"), true);
  assert.equal(await effects.claim("evt_1"), false);
});

test("a conditional check failure is a lost claim", async () => {
  const client = {
    async send() {
      throw new ConditionalCheckFailedException({ message: "exists", $metadata: {} });
    },
  };
  const effects = dynamoEffects(client as never, "order-effects");
  assert.equal(await effects.claim("evt_1"), false);
});
