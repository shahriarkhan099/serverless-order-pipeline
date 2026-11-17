export type WorkItem = { queue: string; body: string };

export function toWorkItem(event: { id?: unknown; type?: unknown; orderId?: unknown }): WorkItem | null {
  if (event.type !== "order.placed") return null;
  if (typeof event.id !== "string" || typeof event.orderId !== "string") return null;
  return { queue: "order-work", body: JSON.stringify({ id: event.id, type: event.type, orderId: event.orderId }) };
}
