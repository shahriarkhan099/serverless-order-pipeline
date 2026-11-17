import "./infrastructure/env.js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { placeOrder } from "./application/place-order.js";
import { readConfig } from "./config.js";
import { prisma } from "./infrastructure/db.js";
import { PrismaOrderStore } from "./infrastructure/prisma-order-store.js";
import { createApp } from "./interfaces/http/app.js";
import { launchIfMain } from "./runtime.js";

export async function startOrders(options: { port?: number; exit?: (code: number) => void } = {}) {
  const port = options.port ?? readConfig().port;
  const exit = options.exit ?? process.exit;
  const store = new PrismaOrderStore(prisma);
  const app = createApp((input) => placeOrder(store, input));
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(port, () => {
      const bound = listening.address() as AddressInfo;
      console.log(`orders listening on ${bound.port}`);
      resolve(listening);
    });
  });
  const actualPort = (server.address() as AddressInfo).port;

  function shutdown() {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    return new Promise<void>((resolve) => {
      server.close(() => {
        void prisma.$disconnect().finally(() => {
          exit(0);
          resolve();
        });
      });
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return { port: actualPort, shutdown };
}

void launchIfMain(process.argv[1], import.meta.url, startOrders);
