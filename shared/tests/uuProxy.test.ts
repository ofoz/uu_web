import { describe, expect, it } from "vitest";

import { assertAllowedUuApiPath, parseMaybeJsonBody, sanitizeUuProxyHeaders } from "../src/uuProxy.js";

describe("UU proxy shared helpers", () => {
  it("keeps Node and Cloudflare proxy validation consistent", () => {
    expect(() => assertAllowedUuApiPath("/api/v1/device/groups/of/my")).not.toThrow();
    expect(() => assertAllowedUuApiPath("/api/v2/room/share/control_mode")).not.toThrow();
    expect(() => assertAllowedUuApiPath("/api/v2/room/join/share/by_code")).not.toThrow();
    expect(() => assertAllowedUuApiPath("/api/v2/room/join/share/by_confirmation")).not.toThrow();
    expect(() => assertAllowedUuApiPath("/api/v2/room/share/cancel_remote_assist")).not.toThrow();
    expect(() => assertAllowedUuApiPath("/api/v2/room/share/unknown")).toThrow("Unsupported UU API path");
    expect(() => assertAllowedUuApiPath("https://api.nrd.nie.163.com/api/v1/device/groups/of/my")).toThrow(
      "Unsupported UU API path",
    );
    expect(() => assertAllowedUuApiPath("/api/v1/../admin")).toThrow("Unsafe UU API path");
  });

  it("removes hop-by-hop headers before forwarding", () => {
    expect(
      sanitizeUuProxyHeaders({
        Host: "evil.example",
        Connection: "keep-alive",
        "X-Param-SIGN": "sig",
        "User-Agent": "uurc-web",
      }),
    ).toEqual({
      "X-Param-SIGN": "sig",
      "User-Agent": "uurc-web",
    });
  });

  it("parses JSON proxy responses without changing text responses", () => {
    expect(parseMaybeJsonBody('{"code":0}', "application/json")).toEqual({ code: 0 });
    expect(parseMaybeJsonBody("plain", "text/plain")).toBe("plain");
    expect(parseMaybeJsonBody("", "application/json")).toBeNull();
  });
});
