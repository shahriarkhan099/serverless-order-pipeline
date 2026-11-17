import { shouldDeadLetter } from "../../application/dead-letter.js";
import type { EffectClaim } from "../../application/effects.js";
import { parseSqsBody, type WorkMessage } from "../../application/parse-sqs.js";
import { workOrder } from "../../application/work-order.js";
import { partialBatchFailure } from "./failures.js";

export type SqsRecord = {
  messageId: string;
  body: string;
  attributes?: { ApproximateReceiveCount?: string };
};

export type SqsEvent = { Records?: SqsRecord[] };

export async function handleOrderWork(
  event: SqsEvent,
  effects: EffectClaim,
  apply: (message: WorkMessage) => Promise<void>,
) {
  const failed: string[] = [];
  for (const record of event.Records ?? []) {
    const receiveCount = Number(record.attributes?.ApproximateReceiveCount ?? "1");
    if (shouldDeadLetter(receiveCount)) {
      failed.push(record.messageId);
      continue;
    }
    const message = parseSqsBody(record.body);
    if (!message) continue;
    try {
      await workOrder(effects, message, apply);
    } catch {
      failed.push(record.messageId);
    }
  }
  return partialBatchFailure(failed);
}
