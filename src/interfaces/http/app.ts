import express, { type NextFunction, type Request, type Response } from "express";
import type { PlaceOrderInput, PlacedOrder } from "../../domain/order.js";
import { InvalidOrder } from "../../domain/order.js";

type Place = (input: PlaceOrderInput) => Promise<PlacedOrder>;

export function createApp(place: Place) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/orders", async (req, res, next) => {
    try {
      const input = readOrderBody(req.body);
      const order = await place(input);
      res.status(order.created ? 201 : 200).json({
        id: order.id,
        sku: order.sku,
        qty: order.qty,
        idempotencyKey: order.idempotencyKey,
        createdAt: order.createdAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof InvalidOrder) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "failed to place order" });
  });

  return app;
}

function readOrderBody(body: unknown): PlaceOrderInput {
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  return {
    sku: typeof record.sku === "string" ? record.sku : "",
    qty: typeof record.qty === "number" ? record.qty : Number.NaN,
    idempotencyKey: typeof record.idempotencyKey === "string" ? record.idempotencyKey : "",
  };
}
