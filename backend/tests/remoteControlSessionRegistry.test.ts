import { describe, expect, it } from "vitest";

import { RemoteControlSessionRegistry } from "../src/services/remoteControlSessionRegistry.js";

describe("RemoteControlSessionRegistry", () => {
  it("reuses a service within one session and isolates different sessions", () => {
    const registry = new RemoteControlSessionRegistry();

    const first = registry.getOrCreate("session-a");
    const same = registry.getOrCreate("session-a");
    const second = registry.getOrCreate("session-b");

    expect(same).toBe(first);
    expect(second).not.toBe(first);
    expect(registry.size).toBe(2);
  });

  it("expires idle sessions before creating another service", () => {
    let now = 0;
    const registry = new RemoteControlSessionRegistry(undefined, {
      idleTtlMs: 100,
      now: () => now,
    });
    const first = registry.getOrCreate("session-a");

    now = 100;
    registry.getOrCreate("session-b");

    expect(registry.size).toBe(1);
    expect(registry.getOrCreate("session-a")).not.toBe(first);
  });

  it("evicts the least recently used session at the capacity limit", () => {
    let now = 0;
    const registry = new RemoteControlSessionRegistry(undefined, {
      maxSessions: 2,
      idleTtlMs: 10_000,
      now: () => now,
    });
    const first = registry.getOrCreate("session-a");
    now = 1;
    registry.getOrCreate("session-b");
    now = 2;
    registry.getOrCreate("session-b");
    now = 3;
    registry.getOrCreate("session-c");

    expect(registry.size).toBe(2);
    expect(registry.getOrCreate("session-a")).not.toBe(first);
    expect(registry.size).toBe(2);
  });
});
