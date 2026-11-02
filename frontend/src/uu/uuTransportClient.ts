import { assertLoginState, type LoginState } from "@uurc/shared/authState";
import type { UuResponse, UuTransport } from "@uurc/shared/uuTransport";

import { LocalProxyTransport } from "../transport/localProxyTransport.js";
import { getStoredLoginState } from "./loginStateStore.js";
import { assertAllowedUuApiPath, buildSignedHeaders } from "./signing.js";

const transport = new LocalProxyTransport();

export async function signedUuRequest<TBody = unknown>({
  method,
  path,
  body,
  state = getStoredLoginState() ?? {},
  requireAuth = true,
}: {
  method: string;
  path: string;
  body?: unknown;
  state?: Partial<LoginState>;
  requireAuth?: boolean;
}): Promise<UuResponse<TBody>> {
  assertAllowedUuApiPath(path);
  if (requireAuth) assertLoginState(state);

  const bodyText = body === undefined ? "" : JSON.stringify(body);
  const headers = await buildSignedHeaders({ state, method, pathWithQuery: path, body: bodyText });
  if (bodyText) headers["Content-Type"] = "application/json; charset=utf-8";

  const response = await (transport as UuTransport).request<TBody>({ method, path, body, headers });
  return {
    status: response.status,
    statusText: response.status === 200 ? "OK" : undefined,
    headers: response.headers,
    body: response.body,
  };
}
