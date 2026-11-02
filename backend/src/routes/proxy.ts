import { Router } from "express";
import { API_BASE } from "@uurc/shared/constants";
import { assertAllowedUuApiPath, parseMaybeJsonBody, sanitizeUuProxyHeaders } from "@uurc/shared/uuProxy";
import type { UuResponse } from "@uurc/shared/uuTransport";

type FetchLike = typeof fetch;

const UU_PROXY_TIMEOUT_MS = 30_000;

export function createProxyRouter(fetcher: FetchLike = fetch): Router {
  const router = Router();

  router.post("/proxy/uu", async (req, res, next) => {
    try {
      const { method, path, body, headers } = req.body ?? {};
      if (typeof method !== "string" || typeof path !== "string") {
        res.status(400).json({ error: "method and path are required" });
        return;
      }
      assertAllowedUuApiPath(path);
      res.json(
        await forwardUuRequest(fetcher, {
          method,
          path,
          body,
          headers: sanitizeUuProxyHeaders(headers),
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function forwardUuRequest<TBody = unknown>(
  fetcher: FetchLike,
  request: {
    method: string;
    path: string;
    body?: unknown;
    headers: Record<string, string>;
  },
): Promise<UuResponse<TBody>> {
  const bodyText = request.body === undefined ? "" : JSON.stringify(request.body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UU_PROXY_TIMEOUT_MS);
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetcher(`${API_BASE}${request.path}`, {
      method: request.method,
      headers: request.headers,
      body: bodyText || undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const contentType = response.headers.get("content-type") ?? "";
  const responseText = await response.text();

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: parseMaybeJsonBody(responseText, contentType) as TBody,
  };
}
