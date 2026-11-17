export type WorkMessage = { id: string; type: string; orderId: string };

export function parseSqsBody(body: string): WorkMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (record.type !== "order.placed") return null;
  if (typeof record.id !== "string" || typeof record.orderId !== "string") return null;
  return { id: record.id, type: record.type, orderId: record.orderId };
}
