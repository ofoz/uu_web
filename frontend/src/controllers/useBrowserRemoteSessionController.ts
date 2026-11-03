import { buildDefaultStreamerConnectOptionsBase64 } from "@uurc/shared/streamer/connectOptions";
import { STREAMER_CLIENT_TYPES, STREAMER_CONTROL_CONNECT_TYPES } from "@uurc/shared/streamer/connectOptionsModel";
import { buildStreamerControlStreamerDataJson } from "@uurc/shared/streamer/controlConfig";
import { useCallback, useMemo } from "react";

import { sendRemoteSignalControl, sendRemoteSignalSoac } from "../api/remoteSignalApi.js";
import { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";
import { REMOTE_CURSOR_LOCAL_RENDERING_ENABLED } from "../remote/remoteCursor.js";
import { remoteSessionEventBridge } from "../remote/remoteSessionEventBridge.js";
import {
  archiveRemoteDebugEvents,
  attachRemoteSession,
  closeRemoteSession,
  getRemoteSession,
  publishRemoteSessionState,
  useRemoteSessionState,
} from "../remote/remoteSessionStore.js";
import { createAppControlId } from "../remote/remoteSessionUiModel.js";

interface StartBrowserRemoteSessionInput {
  deviceId: string;
  forceRelay: boolean | undefined;
  gzipSdp: boolean;
  remoteAssistance: boolean;
  targetPlatform: number | undefined;
}

/**
 * 浏览器远控会话控制器。
 *
 * 会话与状态都放在 `remote/remoteSessionStore.ts` 的模块级单例里，**不在组件的
 * useRef/useState 里**。远控页会随路由卸载（`RemoteControlRoute` 只在
 * `/devices/:deviceId/control` 下挂载），会话若绑在组件上，退回设备列表就再也
 * 拿不到那个 PeerConnection —— 表现是"再进来画面没了、变成已就绪"。
 *
 * 这里刻意不写卸载清理：真正销毁只在「断开」和页签 × 两处显式调用。
 */
export function useBrowserRemoteSessionController() {
  // 订阅模块级快照：切回远控页时直接拿到现存状态，不会闪回 idle。
  const state = useRemoteSessionState();

  /*
   * sessionRef 的替身：保留 `.current` 形状，让调用方无需改动读取方式。
   *
   * 必须用 useMemo 锁住，**不能每次渲染新建对象**：调用方会把它当作
   * `useEffect` 的依赖（信令轮询、视频、音频、剪贴板、输入五个控制器都这么用），
   * 每次渲染换新引用会让那些 effect 每轮重挂一遍 —— 轮询器被反复"重新 start"、
   * 视频源被反复重新挂载，最终演变成无限更新（`Maximum update depth exceeded`）。
   */
  const sessionRef = useMemo<{ readonly current: BrowserRemoteSession | null }>(
    () => ({
      get current() {
        return getRemoteSession();
      },
    }),
    [],
  );

  const close = useCallback((): void => {
    closeRemoteSession();
  }, []);

  const start = useCallback(async (input: StartBrowserRemoteSessionInput): Promise<BrowserRemoteSession> => {
    // 重连会先关掉上一个会话，并把它累积的调试事件续到新会话里。
    const superseded = getRemoteSession();
    if (superseded) archiveRemoteDebugEvents(superseded.close().debugEvents);

    const appControlId = createAppControlId();
    const session = new BrowserRemoteSession({
      api: {
        sendSignalControl: sendRemoteSignalControl,
        sendSignalSoac: sendRemoteSignalSoac,
      },
      initialDebugEvents: attachRemoteSession(null),
      /*
       * 远端流 / 剪贴板 / 光标一律走模块级分发器，**不要**闭包到页面组件的 setState。
       * 会话要活过页面：闭包到页面的话，用户退回设备列表后这些回调就指向已卸载组件，
       * 被控端推来的 track 无人接收，切回远控页时手里没有任何流 ——
       * 表现就是"再进来画面没了、变成已就绪"。
       */
      onRemoteStream: remoteSessionEventBridge.onRemoteStream,
      onRemoteClipboard: remoteSessionEventBridge.onRemoteClipboard,
      onRemoteCursorShape: remoteSessionEventBridge.onRemoteCursorShape,
      onStateChange: publishRemoteSessionState,
    });
    attachRemoteSession(session);
    const sessionState = await session.start({
      appControlId,
      appDataBase64: buildDefaultStreamerConnectOptionsBase64({
        deviceId: input.deviceId,
        clientType:
          input.targetPlatform === STREAMER_CLIENT_TYPES.Client_MAC
            ? STREAMER_CLIENT_TYPES.Client_MAC
            : STREAMER_CLIENT_TYPES.Client_ANDROID,
        controlConnectType: input.remoteAssistance
          ? STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Assistance
          : STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Normal,
        cursorCapture: !REMOTE_CURSOR_LOCAL_RENDERING_ENABLED,
      }),
      streamerData: buildStreamerControlStreamerDataJson({ controlId: appControlId }),
      forceRelay: input.forceRelay,
      gzipSdp: input.gzipSdp,
      targetPlatform: input.targetPlatform,
    });
    publishRemoteSessionState(sessionState);
    return session;
  }, []);

  /**
   * 与旧接口保持一致：有些调用方会用它把外部算出的状态写回去。
   *
   * 用 useCallback 锁住引用 —— 它被当作五个控制器的 `onSessionStateChange`
   * 传下去，同时也是信令轮询 effect 的依赖。每次渲染换新函数会让轮询 effect
   * 每轮重跑，进而触发状态回写、再触发渲染。
   */
  const setState = useCallback((next: BrowserRemoteSessionState): void => {
    publishRemoteSessionState(next);
  }, []);

  return { close, sessionRef, start, state, setState };
}
