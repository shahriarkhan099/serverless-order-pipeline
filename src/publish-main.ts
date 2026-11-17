import "./infrastructure/env.js";
import { readConfig } from "./config.js";
import { prisma } from "./infrastructure/db.js";
import { createKafkaSender } from "./infrastructure/kafka-sender.js";
import { PrismaOutbox } from "./infrastructure/prisma-outbox.js";

const { kafkaBrokers, outboxBatch } = readConfig();
const kafka = createKafkaSender(kafkaBrokers);
const outbox = new PrismaOutbox(prisma);

await kafka.connect();
try {
  const count = await outbox.publishPending(kafka.sender, outboxBatch);
  console.log(`published ${count}`);
} finally {
  await kafka.disconnect();
  await prisma.$disconnect();
}
