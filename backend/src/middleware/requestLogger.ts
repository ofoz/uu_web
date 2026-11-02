import { createHash } from "node:crypto";

import type { RequestHandler } from "express";
import { REMOTE_SESSION_HEADER, isRemoteSessionId } from "@uurc/shared/remoteSession";

export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const sessionId = req.get(REMOTE_SESSION_HEADER);
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "http_request",
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        remoteSession: isRemoteSessionId(sessionId) ? hashRemoteSessionId(sessionId) : undefined,
      }),
    );
  });
  next();
};

export function hashRemoteSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 12);
}
