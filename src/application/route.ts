export function queueFor(type: string): string | null {
  if (type === "order.placed") return "order-work";
  if (type === "order.failed") return "order-failed";
  return null;
}
