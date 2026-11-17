import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { InvalidOrder } from "../src/domain/order.js";
import { placeOrder } from "../src/application/place-order.js";
import { prisma } from "../src/infrastructure/db.js";
import { PrismaOrderStore, writeOrderWithOutbox } from "../src/infrastructure/prisma-order-store.js";

const store = new PrismaOrderStore(prisma);

beforeEach(async () => {
  await prisma.outbox.deleteMany();
  await prisma.order.deleteMany();
});

after(async () => {
  await prisma.$disconnect();
});

test("a failed transaction leaves no order and no outbox row", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await writeOrderWithOutbox(tx, {
        id: "ord_rollback",
        sku: "mug",
        qty: 1,
        idempotencyKey: "rollback-1",
      });
      throw new Error("nope");
    }),
    /nope/,
  );
  assert.equal(await prisma.order.count(), 0);
  assert.equal(await prisma.outbox.count(), 0);
});

test("one idempotency key creates one order under concurrency", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      placeOrder(store, { sku: "mug", qty: 1, idempotencyKey: "same-key" }),
    ),
  );
  const orders = await prisma.order.findMany();
  const rows = await prisma.outbox.findMany();
  assert.equal(orders.length, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.aggregateId, orders[0]?.id);
  assert.ok(results.every((result) => result.id === orders[0]?.id));
});

test("qty below 1 does not write", async () => {
  await assert.rejects(
    () => placeOrder(store, { sku: "mug", qty: 0, idempotencyKey: "bad-qty" }),
    InvalidOrder,
  );
  assert.equal(await prisma.order.count(), 0);
});
