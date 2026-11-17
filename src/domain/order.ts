export class InvalidOrder extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrder";
  }
}

export type PlaceOrderInput = {
  sku: string;
  qty: number;
  idempotencyKey: string;
};

export type PlacedOrder = {
  id: string;
  sku: string;
  qty: number;
  idempotencyKey: string;
  createdAt: Date;
  created: boolean;
};

export function assertOrderInput(input: PlaceOrderInput): PlaceOrderInput {
  const sku = input.sku.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!sku) throw new InvalidOrder("sku is required");
  if (!Number.isInteger(input.qty) || input.qty < 1) {
    throw new InvalidOrder("qty must be a positive integer");
  }
  if (!idempotencyKey) throw new InvalidOrder("idempotencyKey is required");
  return { sku, qty: input.qty, idempotencyKey };
}
