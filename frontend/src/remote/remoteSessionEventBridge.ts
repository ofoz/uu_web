import type { DecodedStreamerCursorShape } from "@uurc/shared/streamer/controlChannelDecode";

/**
 * 会话事件的分发器（模块级）。
 *
 * 为什么需要它：
 *
 * `BrowserRemoteSession` 在创建时接收 `onRemoteStream` / `onRemoteClipboard` /
 * `onRemoteCursorShape` 三个回调。这些回调在原来的实现里直接闭包到远控页组件的
 * setState —— 但远控页会随路由卸载，会话却要活过页面。一旦用户退回设备列表，
 * 这些闭包就指向已卸载组件的 setState：
 *
 * - 发往已卸载组件的 state 更新会被 React 丢弃（画面源、音频丢失）；
 * - 更糟的是，被控端推来的 track 无人接收，切回远控页时页面手里没有任何流 ——
 *   表现就是"再进来画面没了、变成已就绪"。
 *
 * 所以会话永远只认这份分发器；页面挂载时注册处理器，卸载时注销。
 * 会话在页面不在场期间收到的流会被暂存，切回来时补发一次。
 */

export interface RemoteSessionEventHandlers {
  onRemoteStream(stream: MediaStream): void;
  onRemoteClipboard(text: string): void;
  onRemoteCursorShape(shape: DecodedStreamerCursorShape | null): void;
}

let handlers: RemoteSessionEventHandlers | null = null;

/**
 * 页面不在场期间收到的远端流。
 *
 * 只保留最后一份：同一台被控端的画面源会被后续 track 更新覆盖，
 * 攒一串历史流没有意义，反而会拿着已经结束的 track 去渲染。
 */
let pendingStream: MediaStream | null = null;
let pendingCursorShape: DecodedStreamerCursorShape | null = null;
let hasPendingCursorShape = false;

/** 页面挂载时注册，并把页面不在场期间攒下的事件补发一次。 */
export function registerRemoteSessionHandlers(next: RemoteSessionEventHandlers): () => void {
  handlers = next;
  if (pendingStream) {
    const stream = pendingStream;
    pendingStream = null;
    next.onRemoteStream(stream);
  }
  if (hasPendingCursorShape) {
    const shape = pendingCursorShape;
    pendingCursorShape = null;
    hasPendingCursorShape = false;
    next.onRemoteCursorShape(shape);
  }
  return () => {
    // 只注销自己，避免新页面的处理器被旧页面卸载时的清理误删。
    if (handlers === next) handlers = null;
  };
}

/** 供 BrowserRemoteSession 用的稳定回调，永远指向当前挂载的页面。 */
export const remoteSessionEventBridge: RemoteSessionEventHandlers = {
  onRemoteStream(stream) {
    if (handlers) handlers.onRemoteStream(stream);
    else pendingStream = stream;
  },
  onRemoteClipboard(text) {
    /**
     * 剪贴板消息没有"补发"的语义：页面不在场时收到的剪贴板内容，
     * 过一会儿再凭空塞给用户是错的。丢掉即可。
     */
    handlers?.onRemoteClipboard(text);
  },
  onRemoteCursorShape(shape) {
    if (handlers) handlers.onRemoteCursorShape(shape);
    else {
      pendingCursorShape = shape;
      hasPendingCursorShape = true;
    }
  },
};

/** 测试用：清空暂存与处理器。 */
export function resetRemoteSessionEventBridge(): void {
  handlers = null;
  pendingStream = null;
  pendingCursorShape = null;
  hasPendingCursorShape = false;
}
