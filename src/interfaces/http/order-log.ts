export function orderAccessLine(status: number, sku: string) {
  return `POST /orders ${status} ${sku}`;
}
