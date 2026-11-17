import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { dynamoEffects } from "../../infrastructure/dynamo-effects.js";
import { handleOrderWork, type SqsEvent } from "./handler.js";

export async function handler(event: SqsEvent) {
  const table = process.env.EFFECT_TABLE ?? "order-effects";
  const effects = dynamoEffects(new DynamoDBClient({}), table);
  return handleOrderWork(event, effects, async (message) => {
    console.log(`applied ${message.orderId}`);
  });
}
