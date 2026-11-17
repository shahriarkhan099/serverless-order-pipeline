import "./infrastructure/env.js";
import { placeOrder } from "./application/place-order.js";
import { readConfig } from "./config.js";
import { prisma } from "./infrastructure/db.js";
import { PrismaOrderStore } from "./infrastructure/prisma-order-store.js";
import { createApp } from "./interfaces/http/app.js";

const { port } = readConfig();
const store = new PrismaOrderStore(prisma);
const server = createApp((input) => placeOrder(store, input)).listen(port, () => {
  console.log(`orders listening on ${port}`);
});

function shutdown() {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
