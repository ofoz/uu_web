import { summarizeAuthState } from "@uurc/shared/authState";
import type { AuthStatus, LoginState } from "@uurc/shared/authState";

import { getDesktopBridge, type DesktopBridge } from "../desktop/desktopBridge.js";

const LOGIN_STATE_KEY = "uurc.loginState";
const syncedBridges = new WeakSet<DesktopBridge>();

export function getStoredLoginState(): Partial<LoginState> | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(LOGIN_STATE_KEY);
  let localState: Partial<LoginState> | null = null;
  if (raw) {
    try {
      localState = normalizeLoginState(JSON.parse(raw));
    } catch {
      window.localStorage.removeItem(LOGIN_STATE_KEY);
    }
  }

  if (hasCompleteLoginState(localState)) {
    backfillDesktopLoginState(localState);
    return localState;
  }

  // Electron 壳重开、端口变更或 Chromium 存储尚未落盘时，从桌面壳持久化文件恢复凭证。
  const desktopState = loadDesktopLoginState();
  if (desktopState && (hasCompleteLoginState(desktopState) || !hasAnyLoginField(localState))) {
    window.localStorage.setItem(LOGIN_STATE_KEY, JSON.stringify(desktopState));
    markDesktopBridgeSynced();
    return desktopState;
  }

  return localState;
}

export function getStoredAuthStatus(): AuthStatus {
  return summarizeAuthState(getStoredLoginState());
}

export function clearStoredLoginState(): AuthStatus {
  window.localStorage.removeItem(LOGIN_STATE_KEY);
  clearDesktopLoginState();
  return summarizeAuthState(null);
}

export function importStoredLoginState(input: unknown): AuthStatus {
  const state = normalizeLoginState(input);
  window.localStorage.setItem(LOGIN_STATE_KEY, JSON.stringify(state));
  saveDesktopLoginState(state);
  return summarizeAuthState(state);
}

export function patchStoredLoginState(input: Partial<LoginState>): AuthStatus {
  const next = normalizeLoginState({
    ...(getStoredLoginState() ?? {}),
    ...input,
  });
  window.localStorage.setItem(LOGIN_STATE_KEY, JSON.stringify(next));
  saveDesktopLoginState(next);
  return summarizeAuthState(next);
}

export function exportStoredLoginState(): LoginState {
  const state = getStoredLoginState();
  if (!state) throw new Error("No login state available");
  return state as LoginState;
}

function normalizeLoginState(input: unknown): Partial<LoginState> {
  const record = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return {
    token: stringValue(record.token),
    userId: stringValue(record.userId ?? record.user_id),
    clientId: stringValue(record.clientId ?? record.client_id),
    deviceId: stringValue(record.deviceId ?? record.device_id),
    oaid: stringValue(record.oaid),
    uuid: stringValue(record.uuid),
    channel: stringValue(record.channel),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function hasCompleteLoginState(state: Partial<LoginState> | null | undefined): state is Partial<LoginState> {
  return Boolean(state?.token && state?.userId && state?.deviceId);
}

function hasAnyLoginField(state: Partial<LoginState> | null | undefined): boolean {
  if (!state) return false;
  return Object.values(state).some((value) => typeof value === "string" && value.length > 0);
}

function markDesktopBridgeSynced(): void {
  const bridge = getDesktopBridge();
  if (bridge) syncedBridges.add(bridge);
}

function backfillDesktopLoginState(state: Partial<LoginState>): void {
  const bridge = getDesktopBridge();
  if (!bridge?.saveLoginState || syncedBridges.has(bridge)) return;
  try {
    if (bridge.saveLoginState(state) !== false) {
      syncedBridges.add(bridge);
    }
  } catch {
    // 桌面桥接保存失败不影响页面内 localStorage 使用。
  }
}

function loadDesktopLoginState(): Partial<LoginState> | null {
  const bridge = getDesktopBridge();
  if (!bridge?.loadLoginState) return null;
  try {
    const raw = bridge.loadLoginState();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const normalized = normalizeLoginState(raw);
    return hasAnyLoginField(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function saveDesktopLoginState(state: Partial<LoginState>): void {
  const bridge = getDesktopBridge();
  if (!bridge?.saveLoginState) return;
  try {
    if (bridge.saveLoginState(state) !== false) {
      syncedBridges.add(bridge);
    }
  } catch {
    // 桌面桥接保存失败不影响页面内 localStorage 使用。
  }
}

function clearDesktopLoginState(): void {
  const bridge = getDesktopBridge();
  if (!bridge) return;
  syncedBridges.delete(bridge);
  try {
    bridge.clearLoginState?.();
  } catch {
    // 忽略桌面桥接清理异常。
  }
}
