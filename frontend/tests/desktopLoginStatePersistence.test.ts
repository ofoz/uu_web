// @vitest-environment node
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createDesktopLoginStateStore, hasCompleteLoginState, normalizeDesktopLoginState, resolveInitialUrl } =
  require("../../desktop/loginStatePersistence.cjs") as {
    createDesktopLoginStateStore: (options: {
      filePath: string;
      safeStorage?: {
        isEncryptionAvailable: () => boolean;
        encryptString: (plainText: string) => Buffer;
        decryptString: (encrypted: Buffer) => string;
      } | null;
    }) => {
      load: () => Record<string, string> | null;
      save: (input: unknown) => Record<string, string> | null;
      clear: () => boolean;
    };
    hasCompleteLoginState: (state: Record<string, string> | null) => boolean;
    normalizeDesktopLoginState: (input: unknown) => Record<string, string> | null;
    resolveInitialUrl: (appUrl: string, savedState: Record<string, string> | null) => string;
  };

const tempDirs: string[] = [];

function createTempFilePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uurc-desktop-auth-"));
  tempDirs.push(dir);
  return path.join(dir, "login-state.json");
}

describe("desktop loginStatePersistence", () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("normalizes camelCase/snake_case fields and detects completeness", () => {
    const state = normalizeDesktopLoginState({
      token: "synthetic-token",
      user_id: "user-1",
      client_id: "client-1",
      device_id: "device-1",
      oaid: "",
      channel: "official",
      extraIgnored: "ignored",
    });

    expect(state).toEqual({
      token: "synthetic-token",
      userId: "user-1",
      clientId: "client-1",
      deviceId: "device-1",
      channel: "official",
    });
    expect(hasCompleteLoginState(state)).toBe(true);
    expect(hasCompleteLoginState({ deviceId: "device-1" })).toBe(false);
    expect(normalizeDesktopLoginState({})).toBeNull();
  });

  it("persists and reloads encrypted credentials using safeStorage when available", () => {
    const filePath = createTempFilePath();
    const fakeSafeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (plainText: string) => Buffer.from(`enc:${plainText}`, "utf8"),
      decryptString: (encrypted: Buffer) => encrypted.toString("utf8").replace(/^enc:/, ""),
    };

    const store = createDesktopLoginStateStore({ filePath, safeStorage: fakeSafeStorage });
    const credentials = {
      token: "synthetic-token",
      userId: "user-1",
      clientId: "client-1",
      deviceId: "device-1",
      channel: "official",
    };

    store.save(credentials);
    const rawEnvelope = JSON.parse(fs.readFileSync(filePath, "utf8")) as { encrypted: boolean; payload: string };
    expect(rawEnvelope.encrypted).toBe(true);
    expect(rawEnvelope.payload).not.toContain("synthetic-token");

    // 模拟关闭后重新实例化进程再加载。
    const reopenedStore = createDesktopLoginStateStore({ filePath, safeStorage: fakeSafeStorage });
    expect(reopenedStore.load()).toEqual(credentials);

    reopenedStore.clear();
    expect(reopenedStore.load()).toBeNull();
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("falls back to restricted file storage when safeStorage is unavailable or throws", () => {
    const filePath = createTempFilePath();
    const failingSafeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: () => {
        throw new Error("keyring locked");
      },
      decryptString: () => {
        throw new Error("keyring locked");
      },
    };

    const store = createDesktopLoginStateStore({ filePath, safeStorage: failingSafeStorage });
    const credentials = {
      token: "synthetic-token",
      userId: "user-1",
      deviceId: "device-1",
    };

    store.save(credentials);
    const rawEnvelope = JSON.parse(fs.readFileSync(filePath, "utf8")) as { encrypted: boolean };
    expect(rawEnvelope.encrypted).toBe(false);
    expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
    expect(store.load()).toEqual(credentials);
  });

  it("ignores corrupted credential files safely", () => {
    const filePath = createTempFilePath();
    fs.writeFileSync(filePath, "{broken-json", "utf8");
    const store = createDesktopLoginStateStore({ filePath });
    expect(store.load()).toBeNull();
  });

  it("routes root launches directly to /devices only when complete credentials are stored", () => {
    const complete = { token: "synthetic-token", userId: "user-1", deviceId: "device-1" };
    const partial = { deviceId: "device-1" };

    expect(resolveInitialUrl("http://127.0.0.1:8787/", complete)).toBe("http://127.0.0.1:8787/devices");
    expect(resolveInitialUrl("http://127.0.0.1:8787/", partial)).toBe("http://127.0.0.1:8787/");
    expect(resolveInitialUrl("http://127.0.0.1:8787/", null)).toBe("http://127.0.0.1:8787/");
    expect(resolveInitialUrl("http://127.0.0.1:8787/partner", complete)).toBe("http://127.0.0.1:8787/partner");
  });
});
