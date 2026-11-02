import { describe, expect, it } from "vitest";

import { isRemoteSessionId } from "../src/remoteSession.js";

describe("remote session identifiers", () => {
  it("accepts opaque high-entropy identifiers", () => {
    expect(isRemoteSessionId("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isRemoteSessionId("A_bcdefghijklmnopqrstuvwxyz012345")).toBe(true);
  });

  it("rejects missing, short, or unsafe identifiers", () => {
    expect(isRemoteSessionId(undefined)).toBe(false);
    expect(isRemoteSessionId("short")).toBe(false);
    expect(isRemoteSessionId("0123456789abcdef0123456789abcde/")).toBe(false);
  });
});
