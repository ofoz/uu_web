import { useSyncExternalStore } from "react";

import type { RemoteControlHandoff } from "../app/remoteControlTypes.js";

/**
 * 已建立的远控连接（每个 deviceId 一份）。
 *
 * 背景：远控页原来是设备列表路由的子页面，离开就等于断开。改成"连接独立于页面存在"
 * 之后，连接对象存放在这里、页面只是它的视图：
 * - 从设备列表点「连接」→ handoff 写入这里 → 跳到远控页
 * - 点返回 / 关闭页签 → 只切视图，handoff 仍留着，随时可以切回来
 * - 只有顶栏「断开」或页签上的 × 才真正拆连接
 *
 * 一个窗口进程一份（模块级单例）。多窗口隔离由 Electron 的 webContents 保证。
 */
export interface RemoteConnection {
  deviceId: string;
  /** 建立连接时从设备列表带过来的信息；设备列表刷新后用它兜底显示名字。 */
  deviceName: string;
  handoff: RemoteControlHandoff;
  /** 建立时间，用于页签排序（老的在前，切回来的位置稳定）。 */
  openedAt: number;
}

type Listener = () => void;

const EMPTY: readonly RemoteConnection[] = [];
const connections = new Map<string, RemoteConnection>();
const listeners = new Set<Listener>();
let snapshot: readonly RemoteConnection[] = EMPTY;

function publish() {
  snapshot = [...connections.values()].sort((a, b) => a.openedAt - b.openedAt);
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openConnection(connection: Omit<RemoteConnection, "openedAt">): void {
  const existing = connections.get(connection.deviceId);
  // 同一台设备重新连接：沿用原来的建立时间，页签位置不要跳。
  connections.set(connection.deviceId, { ...connection, openedAt: existing?.openedAt ?? Date.now() });
  publish();
}

export function closeConnection(deviceId: string): void {
  if (!connections.delete(deviceId)) return;
  publish();
}

export function getConnection(deviceId: string): RemoteConnection | null {
  return connections.get(deviceId) ?? null;
}

export function listConnections(): readonly RemoteConnection[] {
  return snapshot;
}

/** 设备列表刷新后同步后台返回的数据（房间状态、占用情况会变）。 */
export function refreshConnectionHandoff(deviceId: string, update: Partial<RemoteControlHandoff>): void {
  const existing = connections.get(deviceId);
  if (!existing) return;
  connections.set(deviceId, { ...existing, handoff: { ...existing.handoff, ...update } });
  publish();
}

/** 测试用：清空所有连接，避免用例之间串状态。 */
export function resetConnections(): void {
  connections.clear();
  publish();
}

export function useRemoteConnections(): readonly RemoteConnection[] {
  // 服务端渲染时没有连接，给同一份空快照，避免 hydration 时快照漂移。
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}
