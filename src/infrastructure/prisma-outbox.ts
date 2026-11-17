import type { Prisma, PrismaClient } from "@prisma/client";
import { ordersTopic, type MessageSender, type OutboxPublisher } from "../application/ports.js";

type OutboxRow = {
  id: bigint | number | string;
  aggregate_id: string;
  type: string;
  payload: Prisma.JsonValue;
};

export class PrismaOutbox implements OutboxPublisher {
  constructor(private readonly db: PrismaClient) {}

  async publishPending(sender: MessageSender, limit = 20) {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT id, aggregate_id, type, payload
        FROM "outbox"
        WHERE published_at IS NULL
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `;
      if (rows.length === 0) return 0;

      await sender.send({
        topic: ordersTopic,
        messages: rows.map((row) => {
          const id = typeof row.id === "bigint" ? row.id : BigInt(row.id);
          const payload = asRecord(row.payload);
          return {
            key: row.aggregate_id,
            value: JSON.stringify({
              id: id.toString(),
              type: row.type,
              orderId: row.aggregate_id,
              sku: payload.sku,
              qty: payload.qty,
            }),
          };
        }),
      });

      await tx.outbox.updateMany({
        where: { id: { in: rows.map((row) => toBigInt(row.id)) } },
        data: { publishedAt: new Date() },
      });
      return rows.length;
    });
  }
}

function toBigInt(value: bigint | number | string) {
  return typeof value === "bigint" ? value : BigInt(value);
}

function asRecord(value: Prisma.JsonValue): { sku?: unknown; qty?: unknown } {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value;
  return {};
}
