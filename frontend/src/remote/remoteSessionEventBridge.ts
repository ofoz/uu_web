import type { DecodedStreamerCursorShape } from "@uurc/shared/streamer/controlChannelDecode";

/**
 * 会话事件的分发器（按设备分片）。
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
 * 所以每个会话只认**自己那台设备**的分发器；页面挂载时以 deviceId 注册处理器，
 * 卸载时注销。某台设备在页面不在场期间收到的流会被暂存，切回来时补发一次。
 *
 * 为什么按设备分片：多连接下同时有多条会话在推流。全局一份处理器槽位的话，
 * B 的会话事件会被派给 A 页面注册的处理器（或反过来），画面源互相覆盖。
 */
export interface RemoteSessionEventHandlers {
  onRemoteStream(stream: MediaStream): void;
  onRemoteClipboard(text: string): void;
  onRemoteCursorShape(shape: DecodedStreamerCursorShape | null): void;
}

interface PendingEvents {
  stream: MediaStream | null;
  cursorShape: DecodedStreamerCursorShape | null;
  hasCursorShape: boolean;
}

const handlersByDevice = new Map<string, RemoteSessionEventHandlers>();
const pendingByDevice = new Map<string, PendingEvents>();

function pendingFor(deviceId: string): PendingEvents {
  let pending = pendingByDevice.get(deviceId);
  if (!pending) {
    pending = { stream: null, cursorShape: null, hasCursorShape: false };
    pendingByDevice.set(deviceId, pending);
  }
  return pending;
}

/** 页面挂载时以 deviceId 注册处理器，并把该设备不在场期间攒下的事件补发一次。 */
export function registerRemoteSessionHandlers(deviceId: string, next: RemoteSessionEventHandlers): () => void {
  handlersByDevice.set(deviceId, next);
  const pending = pendingByDevice.get(deviceId);
  if (pending?.stream) {
    const stream = pending.stream;
    pending.stream = null;
    next.onRemoteStream(stream);
  }
  if (pending?.hasCursorShape) {
    const shape = pending.cursorShape;
    pending.cursorShape = null;
    pending.hasCursorShape = false;
    next.onRemoteCursorShape(shape);
  }
  return () => {
    // 只注销自己，避免新页面的处理器被旧页面卸载时的清理误删。
    if (handlersByDevice.get(deviceId) === next) handlersByDevice.delete(deviceId);
  };
}

/**
 * 为某台设备的会话生成一组事件回调。
 *
 * 每台设备的会话用自己的这组回调，事件只会派给"正在看这台设备的页面"；
 * 页面不在场时暂存该设备的最后一份流，等它切回来补发。
 */
export function makeSessionEventBridge(deviceId: string): RemoteSessionEventHandlers {
  return {
    onRemoteStream(stream) {
      const handlers = handlersByDevice.get(deviceId);
      if (handlers) handlers.onRemoteStream(stream);
      else {
        /*
         * 页面不在场期间收到的远端流。
         * 只保留最后一份：同一台被控端的画面源会被后续 track 更新覆盖，
         * 攒一串历史流没有意义，反而会拿着已经结束的 track 去渲染。
         */
        pendingFor(deviceId).stream = stream;
      }
    },
    onRemoteClipboard(text) {
      /**
       * 剪贴板消息没有"补发"的语义：页面不在场时收到的剪贴板内容，
       * 过一会儿再凭空塞给用户是错的。丢掉即可。
       */
      handlersByDevice.get(deviceId)?.onRemoteClipboard(text);
    },
    onRemoteCursorShape(shape) {
      const handlers = handlersByDevice.get(deviceId);
      if (handlers) handlers.onRemoteCursorShape(shape);
      else {
        const pending = pendingFor(deviceId);
        pending.cursorShape = shape;
        pending.hasCursorShape = true;
      }
    },
  };
}

/** 测试用：清空暂存与处理器。 */
export function resetRemoteSessionEventBridge(): void {
  handlersByDevice.clear();
  pendingByDevice.clear();
}
