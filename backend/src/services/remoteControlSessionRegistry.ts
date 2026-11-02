import { createHash } from "node:crypto";

import { RemoteControlService } from "./remoteControlService.js";
import type { SignalGatewayConnector } from "./signalGateway.js";

const DEFAULT_MAX_REMOTE_SESSIONS = 64;
const DEFAULT_REMOTE_SESSION_IDLE_TTL_MS = 60 * 60 * 1000;

interface RemoteControlSessionEntry {
  service: RemoteControlService;
  lastAccessedAt: number;
}

interface RemoteControlSessionRegistryOptions {
  maxSessions?: number;
  idleTtlMs?: number;
  now?: () => number;
}

export class RemoteControlSessionRegistry {
  private readonly sessions = new Map<string, RemoteControlSessionEntry>();
  private readonly maxSessions: number;
  private readonly idleTtlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly signalGatewayConnector?: SignalGatewayConnector,
    options: RemoteControlSessionRegistryOptions = {},
  ) {
    this.maxSessions = Math.max(1, options.maxSessions ?? DEFAULT_MAX_REMOTE_SESSIONS);
    this.idleTtlMs = Math.max(1, options.idleTtlMs ?? DEFAULT_REMOTE_SESSION_IDLE_TTL_MS);
    this.now = options.now ?? Date.now;
  }

  getOrCreate(sessionId: string): RemoteControlService {
    const now = this.now();
    this.pruneExpired(now);
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.lastAccessedAt = now;
      return existing.service;
    }

    if (this.sessions.size >= this.maxSessions) this.evictOldest();

    const service = new RemoteControlService(undefined, this.signalGatewayConnector, hashSessionId(sessionId));
    this.sessions.set(sessionId, { service, lastAccessedAt: now });
    return service;
  }

  release(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  get size(): number {
    return this.sessions.size;
  }

  private pruneExpired(now: number): void {
    for (const [sessionId, entry] of this.sessions) {
      if (now - entry.lastAccessedAt >= this.idleTtlMs) this.evict(sessionId, entry);
    }
  }

  private evictOldest(): void {
    let oldest: [string, RemoteControlSessionEntry] | undefined;
    for (const entry of this.sessions) {
      if (!oldest || entry[1].lastAccessedAt < oldest[1].lastAccessedAt) oldest = entry;
    }
    if (oldest) this.evict(...oldest);
  }

  private evict(sessionId: string, entry: RemoteControlSessionEntry): void {
    this.sessions.delete(sessionId);
    void entry.service.stopSignalGateway().catch(() => {
      // Session eviction must continue even when a connector fails during cleanup.
    });
  }
}

function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 12);
}
