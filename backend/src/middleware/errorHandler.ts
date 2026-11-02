import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = typeof error?.status === "number" ? error.status : 500;
  res.status(status).json({
    error: message,
  });
};
