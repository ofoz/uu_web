export const REMOTE_SESSION_HEADER = "X-UURC-Session";
const REMOTE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function isRemoteSessionId(value: unknown): value is string {
  return typeof value === "string" && REMOTE_SESSION_ID_PATTERN.test(value);
}
