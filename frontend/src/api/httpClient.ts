import { REMOTE_SESSION_HEADER } from "@uurc/shared/remoteSession";

import { getRemoteSessionId } from "./remoteSession.js";

export async function requestJson<T>(path: string, init: RequestInit = {}, remoteSession = false): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (remoteSession) headers.set(REMOTE_SESSION_HEADER, getRemoteSessionId());

  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return body as T;
}
