import { Kafka } from "kafkajs";
import type { MessageSender } from "../application/ports.js";

export function createKafkaSender(brokers: string[]) {
  const kafka = new Kafka({ clientId: "orders", brokers });
  const producer = kafka.producer();
  const sender: MessageSender = {
    send(batch) {
      return producer.send({ topic: batch.topic, messages: batch.messages }).then(() => undefined);
    },
  };
  return {
    sender,
    connect: () => producer.connect(),
    disconnect: () => producer.disconnect(),
  };
}
