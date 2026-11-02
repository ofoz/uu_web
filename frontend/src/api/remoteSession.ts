import { isRemoteSessionId } from "@uurc/shared/remoteSession";

const REMOTE_SESSION_STORAGE_KEY = "uurc.remoteSessionId";
let inMemorySessionId = "";

export function getRemoteSessionId(): string {
  const stored = readStoredSessionId();
  if (stored) return stored;
  if (isRemoteSessionId(inMemorySessionId)) return inMemorySessionId;

  const sessionId = createRemoteSessionId();
  inMemorySessionId = sessionId;
  try {
    globalThis.sessionStorage?.setItem(REMOTE_SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Sandboxed or privacy-restricted browsers can still keep the capability in memory.
  }
  return sessionId;
}

function readStoredSessionId(): string | null {
  try {
    const stored = globalThis.sessionStorage?.getItem(REMOTE_SESSION_STORAGE_KEY);
    return isRemoteSessionId(stored) ? stored : null;
  } catch {
    return null;
  }
}

function createRemoteSessionId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID().replaceAll("-", "");
  }
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Secure random generation is unavailable; remote control cannot create an isolated session.");
}
