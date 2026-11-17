import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import type { EffectClaim } from "../application/effects.js";

export function dynamoEffects(client: DynamoDBClient, tableName: string): EffectClaim {
  return {
    async claim(eventId: string) {
      try {
        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: { eventId: { S: eventId } },
            ConditionExpression: "attribute_not_exists(eventId)",
          }),
        );
        return true;
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) return false;
        throw err;
      }
    },
    async release(eventId: string) {
      await client.send(
        new DeleteItemCommand({
          TableName: tableName,
          Key: { eventId: { S: eventId } },
        }),
      );
    },
  };
}
