import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopBridge } from "../src/desktop/desktopBridge.js";
import {
  clearStoredLoginState,
  getStoredAuthStatus,
  getStoredLoginState,
  importStoredLoginState,
  patchStoredLoginState,
} from "../src/uu/loginStateStore.js";

function createBridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return {
    isDesktop: true,
    platform: "linux",
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
    getWindowState: async () => ({ maximized: false }),
    onWindowStateChange: () => () => {},
    ...overrides,
  };
}

describe("loginStateStore desktop persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.uurcDesktop;
  });

  afterEach(() => {
    window.localStorage.clear();
    delete window.uurcDesktop;
    vi.restoreAllMocks();
  });

  it("restores credentials from desktop storage when localStorage is empty", () => {
    const desktopCredentials = {
      token: "synthetic-token",
      userId: "user-1",
      clientId: "client-1",
      deviceId: "device-1",
      channel: "official",
    };
    const loadLoginState = vi.fn(() => desktopCredentials);
    window.uurcDesktop = createBridge({ loadLoginState });

    const restored = getStoredLoginState();

    expect(loadLoginState).toHaveBeenCalledTimes(1);
    expect(restored).toMatchObject(desktopCredentials);
    expect(getStoredAuthStatus().hasState).toBe(true);
    expect(JSON.parse(window.localStorage.getItem("uurc.loginState") ?? "{}")).toMatchObject(desktopCredentials);
  });

  it("restores complete desktop credentials when localStorage only has partial or corrupted data", () => {
    const complete = {
      token: "synthetic-token",
      userId: "user-1",
      deviceId: "device-1",
    };
    const loadLoginState = vi.fn(() => complete);
    window.uurcDesktop = createBridge({ loadLoginState });

    window.localStorage.setItem("uurc.loginState", "{invalid-json");
    expect(getStoredLoginState()).toMatchObject(complete);
    expect(JSON.parse(window.localStorage.getItem("uurc.loginState") ?? "{}")).toMatchObject(complete);

    window.localStorage.setItem("uurc.loginState", JSON.stringify({ deviceId: "partial-only" }));
    expect(getStoredLoginState()).toMatchObject(complete);
  });

  it("backfills existing localStorage credentials to desktop storage once per bridge", () => {
    const existing = {
      token: "synthetic-token",
      userId: "user-1",
      clientId: "client-1",
      deviceId: "device-1",
    };
    window.localStorage.setItem("uurc.loginState", JSON.stringify(existing));
    const saveLoginState = vi.fn(() => true);
    window.uurcDesktop = createBridge({ saveLoginState });

    expect(getStoredLoginState()).toMatchObject(existing);
    expect(getStoredLoginState()).toMatchObject(existing);
    expect(saveLoginState).toHaveBeenCalledTimes(1);
    expect(saveLoginState).toHaveBeenCalledWith(expect.objectContaining(existing));
  });

  it("mirrors import, patch, and clear operations to the desktop bridge", () => {
    const saveLoginState = vi.fn(() => true);
    const clearLoginState = vi.fn(() => true);
    window.uurcDesktop = createBridge({ saveLoginState, clearLoginState });

    const imported = importStoredLoginState({
      token: "synthetic-token-1",
      user_id: "user-1",
      client_id: "client-1",
      device_id: "device-1",
      channel: "official",
    });
    expect(imported.hasState).toBe(true);
    expect(saveLoginState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        token: "synthetic-token-1",
        userId: "user-1",
        clientId: "client-1",
        deviceId: "device-1",
      }),
    );

    patchStoredLoginState({ token: "synthetic-token-2" });
    expect(saveLoginState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        token: "synthetic-token-2",
        userId: "user-1",
        deviceId: "device-1",
      }),
    );

    const cleared = clearStoredLoginState();
    expect(cleared.hasState).toBe(false);
    expect(clearLoginState).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("uurc.loginState")).toBeNull();
  });

  it("stays resilient if desktop bridge methods throw", () => {
    window.localStorage.setItem(
      "uurc.loginState",
      JSON.stringify({ token: "synthetic-token", userId: "user-1", deviceId: "device-1" }),
    );
    window.uurcDesktop = createBridge({
      loadLoginState: () => {
        throw new Error("ipc failed");
      },
      saveLoginState: () => {
        throw new Error("disk full");
      },
      clearLoginState: () => {
        throw new Error("clear failed");
      },
    });

    expect(getStoredAuthStatus().hasState).toBe(true);
    expect(() => patchStoredLoginState({ channel: "official" })).not.toThrow();
    expect(clearStoredLoginState().hasState).toBe(false);
  });
});
