import type { EffectClaim } from "./effects.js";
import type { WorkMessage } from "./parse-sqs.js";

export async function workOrder(effects: EffectClaim, message: WorkMessage, apply: (message: WorkMessage) => Promise<void>) {
  const won = await effects.claim(message.id);
  if (!won) return "duplicate";
  await apply(message);
  return "applied";
}
