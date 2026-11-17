import type { EffectClaim } from "./effects.js";
import type { WorkMessage } from "./parse-sqs.js";

export async function workOrder(effects: EffectClaim, message: WorkMessage, apply: (message: WorkMessage) => Promise<void>) {
  const won = await effects.claim(message.id);
  if (!won) return "duplicate";
  try {
    await apply(message);
  } catch (err) {
    try {
      await effects.release(message.id);
    } catch {
      // The side-effect error is the one the queue should retry.
    }
    throw err;
  }
  return "applied";
}
