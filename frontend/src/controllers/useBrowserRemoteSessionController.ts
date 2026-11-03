import { buildDefaultStreamerConnectOptionsBase64 } from "@uurc/shared/streamer/connectOptions";
import { STREAMER_CLIENT_TYPES, STREAMER_CONTROL_CONNECT_TYPES } from "@uurc/shared/streamer/connectOptionsModel";
import { buildStreamerControlStreamerDataJson } from "@uurc/shared/streamer/controlConfig";
import { useCallback, useMemo } from "react";

import { sendRemoteSignalControl, sendRemoteSignalSoac } from "../api/remoteSignalApi.js";
import { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";
import { REMOTE_CURSOR_LOCAL_RENDERING_ENABLED } from "../remote/remoteCursor.js";
import { makeSessionEventBridge } from "../remote/remoteSessionEventBridge.js";
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
  /** 被控设备 —— 会话的归属键，画面源 / 音轨 / 事件分发都以它分片。 */
  targetDeviceId: string;
  /** 主控端（当前登录身份）的设备 id，进 appData 给服务端识别用。 */
  authDeviceId: string;
  forceRelay: boolean | undefined;
  gzipSdp: boolean;
  remoteAssistance: boolean;
  targetPlatform: number | undefined;
}

/**
 * 浏览器远控会话控制器（每台设备一份）。
 *
 * 会话与状态都放在 `remote/remoteSessionStore.ts` 的模块级映射里（以被控设备
 * deviceId 为键），**不在组件的 useRef/useState 里**。远控页会随路由卸载
 * （`RemoteControlRoute` 只在 `/devices/:deviceId/control` 下挂载），会话若绑在
 * 组件上，退回设备列表就再也拿不到那个 PeerConnection —— 表现是"再进来画面没了、
 * 变成已就绪"。
 *
 * 必须按设备分片：多连接下同时有多条会话（A、B 各一条），启动 B 绝不能碰 A 的
 * 会话 —— 全局单例的话，连 B 就得杀 A，页签切换就成了摆设。
 *
 * 这里刻意不写卸载清理：真正销毁只在「断开」和页签 × 两处显式调用。
 */
export function useBrowserRemoteSessionController(targetDeviceId: string) {
  // 订阅本设备的模块级快照：切回远控页时直接拿到现存状态，不会闪回 idle。
  const state = useRemoteSessionState(targetDeviceId);

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
        return getRemoteSession(targetDeviceId);
      },
    }),
    [targetDeviceId],
  );

  const close = useCallback((): void => {
    closeRemoteSession(targetDeviceId);
  }, [targetDeviceId]);

  const start = useCallback(
    async (input: Omit<StartBrowserRemoteSessionInput, "targetDeviceId">): Promise<BrowserRemoteSession> => {
      // 重连同一台设备会先关掉上一个会话，并把它累积的调试事件续到新会话里。
      // 注意只动本设备的：其他设备（其他页签）的会话绝不能碰。
      const superseded = getRemoteSession(targetDeviceId);
      if (superseded) archiveRemoteDebugEvents(targetDeviceId, superseded.close().debugEvents);

      const appControlId = createAppControlId();
      const session = new BrowserRemoteSession({
        api: {
          sendSignalControl: sendRemoteSignalControl,
          sendSignalSoac: sendRemoteSignalSoac,
        },
        initialDebugEvents: attachRemoteSession(targetDeviceId, null),
        /*
         * 远端流 / 剪贴板 / 光标一律走按设备分片的模块级分发器，**不要**闭包到
         * 页面组件的 setState。会话要活过页面：闭包到页面的话，用户退回设备列表后
         * 这些回调就指向已卸载组件，被控端推来的 track 无人接收，切回远控页时
         * 手里没有任何流 —— 表现就是"再进来画面没了、变成已就绪"。
         */
        ...makeSessionEventBridge(targetDeviceId),
        onStateChange: (next) => publishRemoteSessionState(targetDeviceId, next),
      });
      attachRemoteSession(targetDeviceId, session);
      const sessionState = await session.start({
        appControlId,
        appDataBase64: buildDefaultStreamerConnectOptionsBase64({
          deviceId: input.authDeviceId,
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
      publishRemoteSessionState(targetDeviceId, sessionState);
      return session;
    },
    [targetDeviceId],
  );

  /**
   * 与旧接口保持一致：有些调用方会用它把外部算出的状态写回去。
   *
   * 用 useCallback 锁住引用 —— 它被当作五个控制器的 `onSessionStateChange`
   * 传下去，同时也是信令轮询 effect 的依赖。每次渲染换新函数会让轮询 effect
   * 每轮重跑，进而触发状态回写、再触发渲染。
   */
  const setState = useCallback(
    (next: BrowserRemoteSessionState): void => {
      publishRemoteSessionState(targetDeviceId, next);
    },
    [targetDeviceId],
  );

  return { close, sessionRef, start, state, setState };
}
