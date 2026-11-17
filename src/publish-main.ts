import "./infrastructure/env.js";
import { readConfig } from "./config.js";
import { prisma } from "./infrastructure/db.js";
import { createKafkaSender, type KafkaProducer } from "./infrastructure/kafka-sender.js";
import { PrismaOutbox } from "./infrastructure/prisma-outbox.js";
import { launchIfMain } from "./runtime.js";

export async function publishOutbox(deps: {
  connect: () => Promise<void>;
  publish: () => Promise<number>;
  disconnect: () => Promise<void>;
  log?: (message: string) => void;
}) {
  const log = deps.log ?? console.log;
  try {
    await deps.connect();
    const count = await deps.publish();
    log(`published ${count}`);
  } finally {
    await deps.disconnect();
  }
}

export function publisherParts(env: NodeJS.ProcessEnv = process.env, producer?: KafkaProducer) {
  const config = readConfig(env);
  const kafka = createKafkaSender(config.kafkaBrokers, producer);
  return { config, kafka, outbox: new PrismaOutbox(prisma) };
}

export function selectPublisher(parts?: ReturnType<typeof publisherParts>) {
  return parts ?? publisherParts();
}

export function runPublisher(parts?: ReturnType<typeof publisherParts>) {
  const resolved = selectPublisher(parts);
  return publishOutbox({
    connect: () => resolved.kafka.connect(),
    publish: () => resolved.outbox.publishPending(resolved.kafka.sender, resolved.config.outboxBatch),
    disconnect: async () => {
      await resolved.kafka.disconnect();
      await prisma.$disconnect();
    },
  });
}

void launchIfMain(process.argv[1], import.meta.url, runPublisher);
