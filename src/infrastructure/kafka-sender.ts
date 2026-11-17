import { Kafka, type Producer } from "kafkajs";
import type { MessageSender } from "../application/ports.js";

export type KafkaProducer = Pick<Producer, "send" | "connect" | "disconnect">;

export function createKafkaSender(brokers: string[], producer?: KafkaProducer) {
  const active =
    producer ??
    new Kafka({
      clientId: "orders",
      brokers,
      connectionTimeout: 1000,
      retry: { retries: 0 },
    }).producer();
  const sender: MessageSender = {
    send(batch) {
      return active.send({ topic: batch.topic, messages: batch.messages }).then(() => undefined);
    },
  };
  return {
    sender,
    connect: () => active.connect(),
    disconnect: () => active.disconnect(),
  };
}
