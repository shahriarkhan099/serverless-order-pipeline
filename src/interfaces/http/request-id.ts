import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function assignRequestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  const id = incoming && incoming.trim() ? incoming.trim() : randomUUID();
  res.setHeader("x-request-id", id);
  next();
}
