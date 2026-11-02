import { describe, expect, it } from "vitest";

import { createConfig } from "../src/config.js";

describe("backend config", () => {
  it("listens on the LAN interface by default", () => {
    const config = createConfig();

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(8787);
    expect(config.enableWisp).toBe(false);
  });

  it("enables the optional Wisp endpoint only when requested", () => {
    expect(createConfig({ enableWisp: true }).enableWisp).toBe(true);
  });
});
