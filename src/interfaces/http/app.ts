import express, { type NextFunction, type Request, type Response } from "express";
import type { PlaceOrderInput, PlacedOrder } from "../../domain/order.js";
import { InvalidOrder } from "../../domain/order.js";
import { assignRequestId } from "./request-id.js";
import { orderAccessLine } from "./order-log.js";

type Place = (input: PlaceOrderInput) => Promise<PlacedOrder>;

export function createApp(place: Place) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use(assignRequestId);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/orders", async (req, res, next) => {
    try {
      const input = readOrderBody(req.body, req.header("idempotency-key"));
      const order = await place(input);
      const status = order.created ? 201 : 200;
      console.log(orderAccessLine(status, order.sku));
      res.status(status).json({
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
    if (clientStatus(err) === 400) {
      res.status(400).json({ error: "invalid json" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "failed to place order" });
  });

  return app;
}

function readOrderBody(body: unknown, header: string | undefined): PlaceOrderInput {
  const record = recordOf(body);
  const fromBody = typeof record.idempotencyKey === "string" ? record.idempotencyKey : "";
  return {
    sku: typeof record.sku === "string" ? record.sku : "",
    qty: typeof record.qty === "number" ? record.qty : Number.NaN,
    idempotencyKey: fromBody || header || "",
  };
}

function recordOf(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return {};
  return body as Record<string, unknown>;
}

export function clientStatus(err: unknown) {
  if (typeof err !== "object" || err === null || !("status" in err)) return undefined;
  return err.status;
}
