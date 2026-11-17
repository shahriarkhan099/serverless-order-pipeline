import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { OrderStore } from "../application/ports.js";
import type { PlaceOrderInput, PlacedOrder } from "../domain/order.js";

type OrderRow = {
  id: string;
  sku: string;
  qty: number;
  idempotencyKey: string;
  createdAt: Date;
};

export function writeOrderWithOutbox(tx: Prisma.TransactionClient, input: PlaceOrderInput & { id: string }) {
  return tx.order.create({ data: input }).then(async (order) => {
    await tx.outbox.create({
      data: {
        aggregateId: order.id,
        type: "order.placed",
        payload: { sku: order.sku, qty: order.qty },
      },
    });
    return order;
  });
}

export class PrismaOrderStore implements OrderStore {
  constructor(private readonly db: PrismaClient) {}

  async place(input: PlaceOrderInput): Promise<PlacedOrder> {
    const existing = await this.db.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return placed(existing, false);

    try {
      const order = await this.db.$transaction((tx) =>
        writeOrderWithOutbox(tx, { ...input, id: randomUUID() }),
      );
      return placed(order, true);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const winner = await this.db.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (!winner) throw err;
      return placed(winner, false);
    }
  }
}

function placed(order: OrderRow, created: boolean): PlacedOrder {
  return { ...order, created };
}

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}
