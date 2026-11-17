import type { PlaceOrderInput, PlacedOrder } from "../domain/order.js";

export const ordersTopic = "orders.events";

export type OrderStore = {
  place(input: PlaceOrderInput): Promise<PlacedOrder>;
};

export type OutboxMessage = {
  id: string;
  type: string;
  orderId: string;
  sku: string;
  qty: number;
};

export type OutboundBatch = {
  topic: string;
  messages: { key: string; value: string }[];
};

export type MessageSender = {
  send(batch: OutboundBatch): Promise<void>;
};

export type OutboxPublisher = {
  publishPending(sender: MessageSender, limit?: number): Promise<number>;
};
