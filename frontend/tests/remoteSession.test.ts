import { beforeEach, describe, expect, it } from "vitest";

import { getRemoteSessionId } from "../src/api/remoteSession.js";

describe("remote session capability", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("persists one opaque identifier for the browser tab", () => {
    const first = getRemoteSessionId();
    const second = getRemoteSessionId();

    expect(first).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(second).toBe(first);
    expect(window.sessionStorage.getItem("uurc.remoteSessionId")).toBe(first);
  });
});
