import { describe, expect, it } from "vitest";
import { createDefaultWispPolicy, isWispTargetAllowed } from "../src/services/wispPolicy.js";

describe("Wisp target policy", () => {
  it("allows known UU API hosts on port 443", () => {
    const policy = createDefaultWispPolicy();

    expect(isWispTargetAllowed("api.nrd.nie.163.com", 443, policy)).toEqual({
      allowed: true,
    });
    expect(isWispTargetAllowed("api-dcdn.nrd.nie.163.com", 443, policy)).toEqual({
      allowed: true,
    });
  });

  it("rejects non-443 ports and unlisted hosts", () => {
    const policy = createDefaultWispPolicy();

    expect(isWispTargetAllowed("api.nrd.nie.163.com", 80, policy)).toEqual({
      allowed: false,
      reason: "port_not_allowed",
    });
    expect(isWispTargetAllowed("example.com", 443, policy)).toEqual({
      allowed: false,
      reason: "host_not_allowed",
    });
  });

  it("rejects direct IP, private, and loopback hosts by default", () => {
    const policy = createDefaultWispPolicy();

    expect(isWispTargetAllowed("127.0.0.1", 443, policy)).toMatchObject({
      allowed: false,
      reason: "direct_ip_not_allowed",
    });
    expect(isWispTargetAllowed("10.0.0.2", 443, policy)).toMatchObject({
      allowed: false,
      reason: "direct_ip_not_allowed",
    });
    expect(isWispTargetAllowed("192.168.1.20", 443, policy)).toMatchObject({
      allowed: false,
      reason: "direct_ip_not_allowed",
    });
  });
});
