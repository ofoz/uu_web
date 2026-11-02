import { describe, expect, it } from "vitest";

import { FRONTEND_APP_SHELL_FILE, FRONTEND_APP_SHELL_PATH, isFrontendAppRoute } from "../src/frontendRoutes.js";

describe("frontend route contract", () => {
  it("keeps product routes on the client app shell", () => {
    expect(FRONTEND_APP_SHELL_PATH).toBe("/app");
    expect(FRONTEND_APP_SHELL_FILE).toBe("app.html");
    expect(isFrontendAppRoute("/login")).toBe(true);
    expect(isFrontendAppRoute("/devices")).toBe(true);
    expect(isFrontendAppRoute("/devices/device-1/control")).toBe(true);
    expect(isFrontendAppRoute("/partner/")).toBe(true);
    expect(isFrontendAppRoute("/account")).toBe(true);
  });

  it("leaves the public landing page and unknown paths outside the app shell", () => {
    expect(isFrontendAppRoute("/")).toBe(false);
    expect(isFrontendAppRoute("/devices/device-1")).toBe(false);
    expect(isFrontendAppRoute("/unknown")).toBe(false);
    expect(isFrontendAppRoute("/api/health")).toBe(false);
  });
});
