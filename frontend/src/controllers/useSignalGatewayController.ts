import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from "react";

import { SIGNAL_GATEWAY_MAX_EVENTS } from "@uurc/shared/signalGateway/status";
import type { RemoteSignalGatewayEvent, RemoteSignalGatewayStatus } from "@uurc/shared/signalGateway/model";
import type { RemoteSignalReadinessDiagnostics } from "@uurc/shared/streamer/readiness";

import type { RoomJoinContext } from "../app/remoteControlTypes.js";
import { getRemoteSignalDiagnostics, getRemoteSignalEvents } from "../api/remoteSignalApi.js";
import type { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";
import {
  getSignalPollState,
  pollSignalAfterSessionAttached,
  startSignalPolling,
  subscribeSignalPolling,
  type SignalPollState,
} from "../remote/signalPolling.js";

/** 订阅连接级轮询器的快照；没有轮询器时返回 null，页面照常渲染空态。 */
function useSignalPollSnapshot(deviceId: string): SignalPollState | null {
  return useSyncExternalStore(
    (listener) => subscribeSignalPolling(deviceId, listener),
    () => (deviceId ? getSignalPollState(deviceId) : null),
    () => null,
  );
}

export function useSignalGatewayController({
  browserStage,
  browserSessionRef,
  deviceId,
  onPollingError,
  onSessionStateChange,
}: {
  browserStage: BrowserRemoteSessionState["stage"];
  browserSessionRef: RefObject<BrowserRemoteSession | null>;
  deviceId: string;
  onPollingError(message: string): void;
  onSessionStateChange(state: BrowserRemoteSessionState): void;
}) {
  const [signalGatewayContext, setSignalGatewayContext] = useState<RoomJoinContext | null>(null);
  const [signalGatewayStatus, setSignalGatewayStatus] = useState<RemoteSignalGatewayStatus | null>(null);
  const [signalEvents, setSignalEvents] = useState<RemoteSignalGatewayEvent[]>([]);
  const [remoteSignalDiagnostics, setRemoteSignalDiagnostics] = useState<RemoteSignalReadinessDiagnostics | null>(null);

  /*
   * 事件游标只有一份，在连接级轮询器里（remote/signalPolling.ts）。
   * 这里不再保存 lastEventId —— 页面和轮询器各存一份会重复应用或漏掉信令事件。
   * 重置时把轮询器一起清掉，保证"重置"在两边语义一致。
   */
  const resetSignalEvents = useCallback(() => {
    setSignalEvents([]);
    setRemoteSignalDiagnostics(null);
  }, []);

  const resetSignalGateway = useCallback(() => {
    resetSignalEvents();
    setSignalGatewayContext(null);
    setSignalGatewayStatus(null);
  }, [resetSignalEvents]);

  /**
   * 把当前会话交给轮询器，并立刻催一轮拉取。
   *
   * 事件游标（lastEventId）必须只有一份，否则页面和轮询器各记一份，会重复应用
   * 或漏掉信令事件。所以这里不再自建一套请求逻辑，而是把会话挂上去，再推一下
   * 连接级轮询器，状态由它统一写入、页面从快照里读。
   *
   * 必须先"交给轮询器"再催：新建会话的 start() 会清空 processedSignalEventIds，
   * 而轮询器若还攥着上一个会话实例，就会把事件喂给已经作废的对象，事件被丢弃、
   * 游标却已经往前走 —— 连接于是永远停在"连接中"。
   */
  const refreshSignalEvents = useCallback(
    async (session = browserSessionRef.current) => {
      if (!session || !deviceId) {
        // 还没有连接就没有会话可交：保持老行为，至少把诊断拉回来给界面用。
        const [nextEvents, diagnostics] = await Promise.all([
          getRemoteSignalEvents(),
          getRemoteSignalDiagnostics(),
        ]);
        if (nextEvents.length > 0) setSignalEvents((current) => mergeSignalEvents(current, nextEvents));
        setRemoteSignalDiagnostics(diagnostics);
        setSignalGatewayStatus((current) => synchronizeGatewayStatus(current, diagnostics));
        return;
      }
      startSignalPolling({
        deviceId,
        session,
        stage: session.getState().stage,
        gatewayActive: true,
        onSessionState: onSessionStateChange,
      });
      // 必须等"无会话"那一轮收尾再跑，否则复用到的是不消费事件的请求。
      await pollSignalAfterSessionAttached(deviceId);
    },
    [browserSessionRef, deviceId, onSessionStateChange],
  );

  useEffect(() => {
    const gatewayActive = signalGatewayStatus?.status === "connected" || signalGatewayStatus?.status === "connecting";
    /*
     * 轮询交给连接级的 signalPolling 管，不在这里持有定时器。
     *
     * 原因见 remote/signalPolling.ts 的模块注释：远控页会随路由卸载，而连接要走得比页面长。
     * 若定时器挂在这个 effect 里，返回设备列表时被 clearInterval，服务端信令就没人拉了，
     * 被控端随即判定主控离线并结束会话 —— 这正是"点返回就断开"的真实成因。
     *
     * 这里只做一件事：告诉轮询器"这条连接的会话现在是哪一个"，以及在组件卸载时**不做**清理。
     *
     * 注意这里**不因为"还没有会话"就跳过**。轮询器自己会把 session=null 当作
     * "先只拉诊断、事件留给我"的状态处理；若在这里跳过，轮询就会晚一步建立，
     * 而那一步的时序差异正是"状态卡在连接中"的来源。控制轮询开不开由 gatewayActive 决定。
     */
    if (!deviceId || browserStage === "idle") return;

    startSignalPolling({
      deviceId,
      session: browserSessionRef.current,
      stage: browserStage,
      gatewayActive,
      onSessionState: onSessionStateChange,
    });
    // 刻意没有 cleanup：停了就等于断开。
  }, [browserSessionRef, browserStage, deviceId, onSessionStateChange, signalGatewayStatus?.status]);

  /* 页面重新挂载时，把轮询器里已有的状态取回来，避免画面/诊断在切回来的瞬间闪空。 */
  const pollState = useSignalPollSnapshot(deviceId);
  useEffect(() => {
    if (!pollState) return;
    if (pollState.events.length > 0) setSignalEvents(pollState.events);
    if (pollState.diagnostics) setRemoteSignalDiagnostics(pollState.diagnostics);
    if (pollState.gatewayStatus) setSignalGatewayStatus(pollState.gatewayStatus);
  }, [pollState]);

  /* 轮询错误只在页面在场时报给用户；页面不在场时错误留在快照里，切回来还能看到。 */
  useEffect(() => {
    if (pollState?.error) onPollingError(pollState.error);
  }, [onPollingError, pollState?.error]);

  return {
    signalGatewayContext,
    setSignalGatewayContext,
    signalGatewayStatus,
    setSignalGatewayStatus,
    signalEvents,
    remoteSignalDiagnostics,
    setRemoteSignalDiagnostics,
    resetSignalEvents,
    resetSignalGateway,
    refreshSignalEvents,
  };
}

function mergeSignalEvents(
  current: RemoteSignalGatewayEvent[],
  incoming: RemoteSignalGatewayEvent[],
): RemoteSignalGatewayEvent[] {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()].sort((left, right) => left.id - right.id).slice(-SIGNAL_GATEWAY_MAX_EVENTS);
}

function synchronizeGatewayStatus(
  current: RemoteSignalGatewayStatus | null,
  diagnostics: RemoteSignalReadinessDiagnostics,
): RemoteSignalGatewayStatus | null {
  if (!current) return current;
  if (
    current.status === diagnostics.gatewayStatus &&
    current.error === diagnostics.gatewayError &&
    current.updatedAt === diagnostics.updatedAt
  ) {
    return current;
  }
  return {
    ...current,
    status: diagnostics.gatewayStatus,
    connectionId: diagnostics.gatewayStatus === "connected" ? current.connectionId : undefined,
    updatedAt: diagnostics.updatedAt ?? current.updatedAt,
    error: diagnostics.gatewayError,
  };
}
