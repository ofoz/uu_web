import { useSyncExternalStore } from "react";

import type { BrowserRemoteSession } from "./browserRemoteSession.js";
import type { BrowserRemoteDebugEvent, BrowserRemoteSessionState } from "./browserRemoteSessionTypes.js";
import { createIdleBrowserRemoteState } from "./remoteSessionUiModel.js";

/**
 * 浏览器远控会话的存活位置。
 *
 * 为什么必须放在模块级、而不是 React 组件的 useRef 里：
 *
 * 远控页是可切走的视图 —— 从远控页退回设备列表时路由变了，`RemoteControlRoute`
 * 连同它里面的 `useRemoteControlController` 一起卸载。若会话引用存在组件的
 * `useRef` 里，随之销毁的就是**唯一指向那个 PeerConnection 的句柄**：WebRTC 连接
 * 本身可能还活着（没人调 close），但界面再也拿不到它 —— 用户看到的就是
 * "返回设备列表再进来，画面没了，变成已就绪"。
 *
 * 所以会话（以及它的状态快照）必须活得比页面久，和 `remoteConnectionsStore`
 * 一样做成模块级单例。页面只订阅快照，不拥有会话。
 *
 * 一个窗口进程一份。多窗口隔离由 Electron 的 webContents 保证；同一窗口内
 * 同时只会查看一条连接的状态（切换设备时会话会被换掉）。
 */

type Listener = () => void;

let session: BrowserRemoteSession | null = null;
let archivedDebugEvents: BrowserRemoteDebugEvent[] = [];
let state: BrowserRemoteSessionState = createIdleBrowserRemoteState();
const listeners = new Set<Listener>();

function publish(next: BrowserRemoteSessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRemoteSession(): BrowserRemoteSession | null {
  return session;
}

export function getRemoteSessionState(): BrowserRemoteSessionState {
  return state;
}

/** 会话内部状态变化（含关闭时推送的 idle）都要经过这里，保证订阅者看到同一份快照。 */
export function publishRemoteSessionState(next: BrowserRemoteSessionState): void {
  publish(next);
}

/** 绑定一个新会话；返回它被换下前那一份归档调试事件，供新会话续接。 */
export function attachRemoteSession(next: BrowserRemoteSession | null): BrowserRemoteDebugEvent[] {
  session = next;
  return archivedDebugEvents;
}

export function archiveRemoteDebugEvents(events: BrowserRemoteDebugEvent[]): void {
  archivedDebugEvents = events;
}

/** 真正销毁会话。只有用户点「断开」或页签 × 时才该调它。 */
export function closeRemoteSession(): BrowserRemoteSessionState {
  const closedState = session?.close();
  if (closedState) archivedDebugEvents = closedState.debugEvents;
  session = null;
  publish(closedState ?? createIdleBrowserRemoteState());
  return state;
}

/** 测试用：清空会话与状态，避免用例之间串味。 */
export function resetRemoteSessionStore(): void {
  session = null;
  archivedDebugEvents = [];
  publish(createIdleBrowserRemoteState());
}

/**
 * 订阅会话状态。
 *
 * 重新挂载页面时 `getServerSnapshot`/首个快照直接给出模块里现存的状态，
 * 所以从设备列表切回远控页，画面与统计都还在，不会闪回"已就绪"。
 */
export function useRemoteSessionState(): BrowserRemoteSessionState {
  return useSyncExternalStore(subscribe, getRemoteSessionState, getRemoteSessionState);
}
