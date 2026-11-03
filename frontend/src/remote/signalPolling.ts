import { SIGNAL_GATEWAY_MAX_EVENTS } from "@uurc/shared/signalGateway/status";
import type { RemoteSignalGatewayEvent, RemoteSignalGatewayStatus } from "@uurc/shared/signalGateway/model";
import type { RemoteSignalReadinessDiagnostics } from "@uurc/shared/streamer/readiness";

import { getRemoteSignalDiagnostics, getRemoteSignalEvents } from "../api/remoteSignalApi.js";
import type { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";

/**
 * 连接级的信令轮询器。
 *
 * 为什么必须独立于 React 组件存在：
 * 远控页是可切走的视图，但**远控会话本身要活过页面**。服务端信令只有被持续拉取，
 * 被控端才不会判定主控离线而结束会话（代码里对"饿死心跳"的注释已经写明这一点）。
 * 轮询若挂在页面的 useEffect 里，一离开远控页就会被 clearInterval，
 * 于是"返回设备列表"必然导致连接断开 —— 这曾是实际发生过的缺陷。
 *
 * 所以这里把定时器放到模块级的 Map 里：谁打开连接谁登记，只有显式 stop
 * （用户点「断开」或页签 ×）才真的停。页面只订阅状态，不拥有轮询。
 */

export interface SignalPollState {
  events: RemoteSignalGatewayEvent[];
  lastEventId: number;
  diagnostics: RemoteSignalReadinessDiagnostics | null;
  gatewayStatus: RemoteSignalGatewayStatus | null;
  error: string | null;
}

type Listener = () => void;

interface Poller {
  timer: number;
  /**
   * 当前由谁消费信令事件。
   *
   * 为 null 表示"还没有会话"：此时仍然持续拉取（保持被控端判定主控在线、诊断也照常刷新），
   * 但**绝不推进事件游标**。会话要等 `session.start()` 把 control 握手做完才开始消费事件，
   * 而 control 握手是个网络往返。如果空窗期先跑一轮 tick，就会把这一批事件（典型是 answer 的 soac）
   * 直接算进游标、却又没人处理 —— 新会话因 `processedSignalEventIds.clear()` 从零开始，
   * 却再也拿不到这些事件，于是状态永远停在"连接中"。这是必须守住的时序。
   */
  session: BrowserRemoteSession | null;
  stopped: boolean;
  /** 在途请求。重复的 tick 请求会并到它上面，而不是各自发一遍。 */
  inFlight: Promise<void> | null;
  stage: BrowserRemoteSessionState["stage"];
  state: SignalPollState;
  listeners: Set<Listener>;
  onSessionState(state: BrowserRemoteSessionState): void;
}

const EMPTY_STATE: SignalPollState = {
  events: [],
  lastEventId: 0,
  diagnostics: null,
  gatewayStatus: null,
  error: null,
};

const pollers = new Map<string, Poller>();

/** 连接已连接时 1500ms 拉一次；握手阶段更快，600ms。 */
function intervalFor(stage: BrowserRemoteSessionState["stage"]): number {
  return stage === "connected" ? 1500 : 600;
}

function emit(poller: Poller): void {
  for (const listener of poller.listeners) listener();
}

/**
 * 开始（或恢复）某条设备的信令轮询。
 *
 * 幂等：同一 deviceId 重复调用不会起第二个定时器，只更新会话与阶段。
 * 这正是"从设备列表切回远控页"时需要的语义 —— 会话还在，轮询也还在。
 *
 * 但"幂等"不等于"可以随便重复调用"。每次调用都得**让轮询器听见新会话**：
 * 重连会换一个 BrowserRemoteSession 实例，如果轮询器还攥着旧实例，就会把新事件
 * 交给一个已经关闭的会话处理（新一代生命周期检查会直接丢弃），状态同样卡在"连接中"。
 */
export function startSignalPolling(input: {
  deviceId: string;
  session: BrowserRemoteSession | null;
  stage: BrowserRemoteSessionState["stage"];
  gatewayActive: boolean;
  onSessionState(state: BrowserRemoteSessionState): void;
}): void {
  const { deviceId } = input;
  const existing = pollers.get(deviceId);

  if (existing) {
    /*
     * 会话换了（重连）或阶段变了：更新引用，按新阶段重设定时器频率。
     *
     * 但要挡掉一种坏输入：传入的是一个已经关闭的会话（stage === "idle"）。
     * `close()` 会把 stage 打回 idle，而 React 的 effect 可能比 `refreshSignalEvents`
     * 更晚一步执行、拿到的还是 `browserSessionRef.current` 里那个刚被换掉的旧实例。
     * 若让它覆盖进来，轮询器就会每 1.5s 把"已关闭会话的空状态"（dataChannels 全空）
     * 写回 React，把新会话真实的 stage=connected 盖掉 —— 表现就是画面明明连着、
     * 顶栏却一直在「连接中」，自动重连还会被反复触发。
     * 有正在工作的会话时，绝不让一个已关闭的会话顶替它。
     */
    const incomingIsClosed = input.session !== null && input.session.getState().stage === "idle";
    const existingIsUsable = existing.session !== null && existing.stage !== "idle";
    if (incomingIsClosed && existingIsUsable) return;

    const sessionChanged = existing.session !== input.session;
    existing.session = input.session;
    existing.onSessionState = input.onSessionState;
    if (existing.stage !== input.stage) {
      existing.stage = input.stage;
      window.clearInterval(existing.timer);
      existing.timer = window.setInterval(() => void tick(deviceId), intervalFor(input.stage));
    }
    /*
     * 新会话接手时立刻催一轮：它可能在 start() 里已清空 processedSignalEventIds，
     * 上一轮被旧会话"预支"过的事件必须重新按游标对齐，否则会一直被跳过。
     * 游标只保存在轮询器里，`applySignalEvents` 自己按 id 去重，重放是安全的。
     */
    if (sessionChanged && input.session) void tick(deviceId);
    /*
     * 注意：这里**不**按 gatewayActive 停轮询。
     * 网关状态本身是靠轮询从服务端诊断里读回来的，一旦用"网关不活跃"去停轮询，
     * 就再也读不到它恢复 —— 自己把自己锁死。停轮询只能由显式 stop 触发（断开/关闭页签）。
     */
    return;
  }

  if (!input.gatewayActive) return;

  const poller: Poller = {
    session: input.session,
    stage: input.stage,
    stopped: false,
    inFlight: null,
    state: EMPTY_STATE,
    listeners: new Set(),
    onSessionState: input.onSessionState,
    timer: 0,
  };
  pollers.set(deviceId, poller);
  poller.timer = window.setInterval(() => void tick(deviceId), intervalFor(input.stage));
  void tick(deviceId);
}

/** 停掉并清空某条设备的轮询。只有"断开连接"才应该调它。 */
export function stopSignalPolling(deviceId: string): void {
  const poller = pollers.get(deviceId);
  if (!poller) return;
  poller.stopped = true;
  window.clearInterval(poller.timer);
  pollers.delete(deviceId);
}

/** 该设备是否正在轮询 —— 用于测试与诊断。 */
export function isPollingSignal(deviceId: string): boolean {
  return pollers.has(deviceId);
}

export function getSignalPollState(deviceId: string): SignalPollState {
  return pollers.get(deviceId)?.state ?? EMPTY_STATE;
}

export function subscribeSignalPolling(deviceId: string, listener: Listener): () => void {
  const poller = pollers.get(deviceId);
  if (!poller) {
    // 连接还没建立时也要能订阅：先挂在"待创建"上会复杂化，
    // 这里直接返回空退订，调用方靠 useSyncExternalStore 的兜底快照渲染空态即可。
    return () => {};
  }
  poller.listeners.add(listener);
  return () => {
    poller.listeners.delete(listener);
  };
}

/** 用户主动断开时用：把所有轮询清掉（登出等场景）。 */
export function resetAllSignalPolling(): void {
  for (const deviceId of [...pollers.keys()]) stopSignalPolling(deviceId);
}

/** 手动催一轮拉取（重连、诊断刷新等需要立刻拿一次最新状态时用）。 */
export function pollSignalOnce(deviceId: string): Promise<void> {
  return tick(deviceId);
}

/**
 * 强制在"该停的都停"之后立刻跑一轮，且这一轮一定带着当前会话。
 *
 * 与 `pollSignalOnce` 的区别：若恰好有一轮**无会话**的请求在途，直接复用它
 * 等于"什么都没消费"（无会话时按设计不推进游标、不应用事件）。这里等它收尾后再跑，
 * 保证调用方 `await` 回来时，事件确实已经交给了会话。
 */
export async function pollSignalAfterSessionAttached(deviceId: string): Promise<void> {
  const poller = pollers.get(deviceId);
  if (!poller || poller.stopped) return;
  if (poller.inFlight) await poller.inFlight.catch(() => undefined);
  if (poller.stopped || poller.inFlight) return;
  await tick(deviceId);
}

/**
 * 一轮拉取。
 *
 * 出错只记录，不停止轮询 —— 网络抖动一次就放弃，会话会白白被判定离线。
 *
 * 两种模式下行为不同，差别就在事件游标：
 * - 有会话：正常消费事件并推进游标。
 * - 无会话：只把诊断拉回来（界面要它），**事件原封不动等在那儿**。
 *   游标一旦在没有消费者时往前走，事件就永久丢失（服务端只按 id > after 返回）。
 *
 * 串行化：已有请求在途时不再发第二个，直接复用它的 Promise。
 * 这样 `await pollSignalOnce()` 的调用方拿到的总是"这一轮真的做完了"，
 * 而不是被重入保护静默跳过、却看起来像拉过一轮。
 */
function tick(deviceId: string): Promise<void> {
  const poller = pollers.get(deviceId);
  if (!poller || poller.stopped) return Promise.resolve();
  if (poller.inFlight) return poller.inFlight;

  const run = drain(poller).finally(() => {
    // 只清自己这一次：期间若已被 stop 并重新 start，新轮询器有自己的 inFlight。
    if (poller.inFlight === run) poller.inFlight = null;
  });
  poller.inFlight = run;
  return run;
}

async function drain(poller: Poller): Promise<void> {
  try {
    const session = poller.session;
    /*
     * 会话是否还能消费事件。
     *
     * stage === "idle" 说明这个实例已经 `close()` 过（或还没 `start()` 过）。
     * 对它的 `applySignalEvents` 会因生命周期代次校验直接丢弃，事件却已经被算进游标 ——
     * 那就等于凭空吃掉了一批信令，新会话再也拉不到。所以这种"僵尸会话"一律按无会话处理：
     * 不消费、不推进游标，等 `startSignalPolling` 把真正能用的会话换上来。
     */
    const sessionUsable = session !== null && session.getState().stage !== "idle";

    const [nextEvents, diagnostics] = await Promise.all([
      getRemoteSignalEvents(poller.state.lastEventId),
      getRemoteSignalDiagnostics(),
    ]);

    // 请求期间连接可能已被关掉，此时结果已经没有意义。
    if (poller.stopped) return;

    let { events, lastEventId } = poller.state;
    /*
     * 无可用会话时不消费事件、不推进游标，只刷新诊断让界面有事可做。
     * 会话会在 control 握手完成后由 startSignalPolling 立刻催一轮，把攒下的事件消费掉。
     */
    if (session && sessionUsable && nextEvents.length > 0) {
      lastEventId = Math.max(lastEventId, ...nextEvents.map((event) => event.id));
      events = mergeEvents(events, nextEvents);
      await session.applySignalEvents(nextEvents);
    }

    if (session && sessionUsable) {
      await session.refreshConnectionStats();
      /*
       * 再确认一次会话没在这轮 await 期间被换掉或被关掉。
       * 把已关闭会话的空状态（dataChannels 全空、stage=idle）写回 React，
       * 会把界面从「已连接」打回「连接中」、顶栏的「断开」按钮也跟着消失 ——
       * 而实际上连接是好的。关闭本身有自己的 setState 推送，不需要轮询补刀。
       */
      if (poller.session === session && session.getState().stage !== "idle") {
        poller.onSessionState(session.getState());
      }
    }

    poller.state = {
      events,
      lastEventId,
      diagnostics,
      gatewayStatus: synchronizeGatewayStatus(poller.state.gatewayStatus, diagnostics),
      error: null,
    };
    emit(poller);
  } catch (caught) {
    if (poller.stopped) return;
    poller.state = { ...poller.state, error: caught instanceof Error ? caught.message : String(caught) };
    emit(poller);
  }
}

function mergeEvents(
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
