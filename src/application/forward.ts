import { queueFor } from "./route.js";

export type WorkItem = { queue: string; body: string };

export function toWorkItem(event: { id?: unknown; type?: unknown; orderId?: unknown } | null): WorkItem | null {
  if (typeof event !== "object" || event === null) return null;
  if (typeof event.type !== "string") return null;
  const queue = queueFor(event.type);
  if (!queue) return null;
  if (typeof event.id !== "string" || event.id.length === 0) return null;
  if (typeof event.orderId !== "string" || event.orderId.length === 0) return null;
  return { queue, body: JSON.stringify({ id: event.id, type: event.type, orderId: event.orderId }) };
}
