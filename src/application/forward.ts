import { queueFor } from "./route.js";

export type WorkItem = { queue: string; body: string };

export function toWorkItem(event: { id?: unknown; type?: unknown; orderId?: unknown }): WorkItem | null {
  if (event.type !== "order.placed") return null;
  if (typeof event.id !== "string" || typeof event.orderId !== "string") return null;
  const queue = queueFor(event.type);
  if (!queue) return null;
  return { queue, body: JSON.stringify({ id: event.id, type: event.type, orderId: event.orderId }) };
}
