import { useSyncExternalStore } from "react";

import type { BrowserRemoteSession } from "./browserRemoteSession.js";
import type { BrowserRemoteDebugEvent, BrowserRemoteSessionState } from "./browserRemoteSessionTypes.js";
import { createIdleBrowserRemoteState } from "./remoteSessionUiModel.js";

/**
 * 浏览器远控会话的存活位置（按设备分片）。
 *
 * 为什么必须放在模块级、而不是 React 组件的 useRef 里：
 *
 * 远控页是可切走的视图 —— 从远控页退回设备列表时路由变了，`RemoteControlRoute`
 * 连同它里面的 `useRemoteControlController` 一起卸载。若会话引用存在组件的
 * `useRef` 里，随之销毁的就是**唯一指向那个 PeerConnection 的句柄**：WebRTC 连接
 * 本身可能还活着（没人调 close），但界面再也拿不到它 —— 用户看到的就是
 * "返回设备列表再进来，画面没了，变成已就绪"。
 *
 * 为什么必须**按设备分片**、而不是全局单例：多连接是产品需求 —— 用户从设备列表
 * 先后连上 A 和 B，两条都要活着、靠页签来回切。若全窗口只有一个会话槽位，
 * 启动 B 时就得把 A `close()` 掉（否则 PeerConnection 泄漏），于是"连 B"变成
 * "杀 A 换 B"：A 的页签失去会话、B 的页面还挂着 A 遗留的画面源 ——
 * 表现就是"标签变了，却没有真正连上"。所以与 `signalPolling` /
 * `remoteConnectionsStore` 一样，这里以 deviceId 为键。
 *
 * 一个窗口进程一份映射。多窗口隔离由 Electron 的 webContents 保证。
 */

type Listener = () => void;

interface SessionEntry {
  session: BrowserRemoteSession | null;
  state: BrowserRemoteSessionState;
  archivedDebugEvents: BrowserRemoteDebugEvent[];
}

const IDLE_STATE = createIdleBrowserRemoteState();

const entries = new Map<string, SessionEntry>();
const listeners = new Map<string, Set<Listener>>();

function entryFor(deviceId: string): SessionEntry {
  let entry = entries.get(deviceId);
  if (!entry) {
    entry = { session: null, state: IDLE_STATE, archivedDebugEvents: [] };
    entries.set(deviceId, entry);
  }
  return entry;
}

function publish(deviceId: string, next: BrowserRemoteSessionState): void {
  entryFor(deviceId).state = next;
  for (const listener of listeners.get(deviceId) ?? []) listener();
}

function subscribe(deviceId: string): (listener: Listener) => () => void {
  return (listener) => {
    let set = listeners.get(deviceId);
    if (!set) {
      set = new Set();
      listeners.set(deviceId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  };
}

export function getRemoteSession(deviceId: string): BrowserRemoteSession | null {
  return entries.get(deviceId)?.session ?? null;
}

export function getRemoteSessionState(deviceId: string): BrowserRemoteSessionState {
  return entries.get(deviceId)?.state ?? IDLE_STATE;
}

/** 会话内部状态变化（含关闭时推送的 idle）都要经过这里，保证订阅者看到同一份快照。 */
export function publishRemoteSessionState(deviceId: string, next: BrowserRemoteSessionState): void {
  publish(deviceId, next);
}

/** 绑定某台设备的新会话；返回它被换下前那一份归档调试事件，供新会话续接。 */
export function attachRemoteSession(deviceId: string, next: BrowserRemoteSession | null): BrowserRemoteDebugEvent[] {
  const entry = entryFor(deviceId);
  entry.session = next;
  return entry.archivedDebugEvents;
}

export function archiveRemoteDebugEvents(deviceId: string, events: BrowserRemoteDebugEvent[]): void {
  entryFor(deviceId).archivedDebugEvents = events;
}

/** 真正销毁某台设备的会话。只有「断开」、页签 × 、登出才该调它。 */
export function closeRemoteSession(deviceId: string): BrowserRemoteSessionState {
  const entry = entryFor(deviceId);
  const closedState = entry.session?.close();
  if (closedState) entry.archivedDebugEvents = closedState.debugEvents;
  entry.session = null;
  publish(deviceId, closedState ?? IDLE_STATE);
  return entry.state;
}

/** 登出用：销毁所有设备的会话。 */
export function closeAllRemoteSessions(): void {
  for (const deviceId of [...entries.keys()]) closeRemoteSession(deviceId);
}

/** 测试用：清空全部会话与状态，避免用例之间串味。 */
export function resetRemoteSessionStore(): void {
  for (const entry of entries.values()) entry.session?.close();
  entries.clear();
  for (const set of listeners.values()) {
    for (const listener of set) listener();
  }
}

/**
 * 订阅某台设备的会话状态。
 *
 * 重新挂载页面时 `getServerSnapshot`/首个快照直接给出模块里现存的状态，
 * 所以从设备列表切回远控页，画面与统计都还在，不会闪回"已就绪"。
 */
export function useRemoteSessionState(deviceId: string): BrowserRemoteSessionState {
  return useSyncExternalStore(subscribe(deviceId), () => getRemoteSessionState(deviceId), () => IDLE_STATE);
}
