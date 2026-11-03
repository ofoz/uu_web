import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSignalPollState,
  isPollingSignal,
  resetAllSignalPolling,
  startSignalPolling,
  stopSignalPolling,
  subscribeSignalPolling,
} from "../src/remote/signalPolling.js";
import type { BrowserRemoteSession } from "../src/remote/browserRemoteSession.js";

/*
 * 连接级信令轮询器的核心契约：**活得比页面久**。
 *
 * 这条不是可有可无的细节 —— 轮询一停，被控端就会判定主控离线并结束会话，
 * 也就是用户看到的"返回设备列表，连接就断了"。这里从模块层面钉死它，
 * 不依赖整页渲染，免得以后再被改回 useEffect 里。
 */

function fakeSession(): BrowserRemoteSession {
  return {
    applySignalEvents: vi.fn(async () => {}),
    refreshConnectionStats: vi.fn(async () => ({})),
    getState: vi.fn(() => ({ stage: "connected" })),
  } as unknown as BrowserRemoteSession;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("signalPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } })),
    );
  });

  afterEach(() => {
    resetAllSignalPolling();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("页面卸载不影响轮询：只有显式 stop 才停", async () => {
    const session = fakeSession();
    startSignalPolling({
      deviceId: "desktop-1",
      session,
      stage: "connected",
      gatewayActive: true,
      onSessionState: () => {},
    });

    expect(isPollingSignal("desktop-1")).toBe(true);

    // 模拟"远控页卸载"：组件没了，但没人调用 stopSignalPolling。
    await vi.advanceTimersByTimeAsync(3200);

    expect(isPollingSignal("desktop-1")).toBe(true);
    expect(session.refreshConnectionStats).toHaveBeenCalled();
  });

  it("显式 stop 之后不再发请求", async () => {
    const session = fakeSession();
    startSignalPolling({
      deviceId: "desktop-2",
      session,
      stage: "connected",
      gatewayActive: true,
      onSessionState: () => {},
    });
    await vi.advanceTimersByTimeAsync(1600);
    const callsBefore = (session.refreshConnectionStats as ReturnType<typeof vi.fn>).mock.calls.length;

    stopSignalPolling("desktop-2");
    expect(isPollingSignal("desktop-2")).toBe(false);

    await vi.advanceTimersByTimeAsync(6000);
    expect((session.refreshConnectionStats as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it("重复 start 不会起第二个定时器（切回远控页是幂等的）", async () => {
    const session = fakeSession();
    const base = {
      deviceId: "desktop-3",
      session,
      stage: "connected" as const,
      gatewayActive: true,
      onSessionState: () => {},
    };
    startSignalPolling(base);
    startSignalPolling(base);
    startSignalPolling(base);

    await vi.advanceTimersByTimeAsync(1600);

    // 若起了 3 个定时器，这一轮会打出 3 倍请求。
    const calls = (session.refreshConnectionStats as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(calls).toBeLessThanOrEqual(2);
  });

  it("订阅者能在状态更新后被通知", async () => {
    const listener = vi.fn();
    startSignalPolling({
      deviceId: "desktop-4",
      session: fakeSession(),
      stage: "connected",
      gatewayActive: true,
      onSessionState: () => {},
    });
    subscribeSignalPolling("desktop-4", listener);

    await vi.advanceTimersByTimeAsync(1600);

    // 拉取完成后快照被更新并广播，订阅者据此重渲染。
    expect(listener).toHaveBeenCalled();
    expect(getSignalPollState("desktop-4").error).toBeNull();
  });

  /*
   * 下面两例守的是一个很隐蔽、但真实发生过的时序缺陷：
   *
   * 新会话的 start() 会先发 control 握手（一次网络往返），回来后才清空
   * processedSignalEventIds。若轮询器在"还没有会话"的空窗期先跑了一轮，
   * 就会把这批事件（典型是 answer 的 soac）算进游标、却没人处理；
   * 新会话随后从零开始，却再也拉不到这些事件 —— 界面永远停在"连接中"。
   */
  it("没有会话时只拉诊断，不推进事件游标", async () => {
    stubSignalFetch([sampleSoac()]);

    startSignalPolling({
      deviceId: "desktop-5",
      session: null,
      stage: "idle",
      gatewayActive: true,
      onSessionState: () => {},
    });
    await vi.advanceTimersByTimeAsync(1200);

    // 事件被拉回来了，但不能被吃掉：游标仍为 0，等会话接手时重新按 id>0 拉。
    expect(getSignalPollState("desktop-5").lastEventId).toBe(0);
  });

  it("会话接手后立刻消费空窗期攒下的事件", async () => {
    stubSignalFetch([sampleSoac()]);

    startSignalPolling({
      deviceId: "desktop-6",
      session: null,
      stage: "idle",
      gatewayActive: true,
      onSessionState: () => {},
    });
    await vi.advanceTimersByTimeAsync(1200);

    const session = fakeSession();
    startSignalPolling({
      deviceId: "desktop-6",
      session,
      stage: "offered",
      gatewayActive: true,
      onSessionState: () => {},
    });
    await vi.advanceTimersByTimeAsync(0);

    // 接手即消费：否则这批事件会被游标跳过，连接永远停在"连接中"。
    expect(session.applySignalEvents).toHaveBeenCalledWith([expect.objectContaining({ id: 1, event: "soac" })]);
    expect(getSignalPollState("desktop-6").lastEventId).toBe(1);
  });

  /*
   * 另一个把界面打回「连接中」的路径：轮询器攥着一个**已经关闭**的会话。
   *
   * 会话关闭只要点一下断开/重连就会发生，而轮询器是连接级的、活得比它久。
   * 若它还拿这个僵尸会话去刷状态，就会把 `stage: idle`、`dataChannels: {}` 写回 React——
   * 界面于是从「已连接」退回「连接中」、顶栏「断开」按钮消失。
   */
  it("已关闭的会话既不消费事件，也不回写 idle 状态", async () => {
    stubSignalFetch([sampleSoac()]);

    const closedSession = {
      applySignalEvents: vi.fn(async () => {}),
      refreshConnectionStats: vi.fn(async () => ({})),
      getState: vi.fn(() => ({ stage: "idle" })),
    } as unknown as BrowserRemoteSession;
    const onSessionState = vi.fn();

    startSignalPolling({
      deviceId: "desktop-7",
      session: closedSession,
      stage: "offered",
      gatewayActive: true,
      onSessionState,
    });
    await vi.advanceTimersByTimeAsync(1200);

    expect(closedSession.applySignalEvents).not.toHaveBeenCalled();
    expect(onSessionState).not.toHaveBeenCalled();
    // 事件没被吃掉：真正可用的会话接手后仍能拿到。
    expect(getSignalPollState("desktop-7").lastEventId).toBe(0);
  });
});

function sampleSoac() {
  return { id: 1, direction: "inbound", event: "soac", receivedAt: "2026-05-14T00:00:00.200Z", payload: [] };
}

/** 只模拟信令事件与诊断两个端点；诊断给一份形状正确的空诊断即可。 */
function stubSignalFetch(events: unknown[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const path = String(input);
      if (path.startsWith("/api/remote/signal/events")) {
        const after = Number.parseInt(new URL(path, "https://uurc.test").searchParams.get("after") ?? "0", 10);
        return jsonResponse(events.filter((event) => (event as { id: number }).id > after));
      }
      if (path === "/api/remote/signal/diagnostics") {
        return jsonResponse({ events: [], gatewayStatus: "connected" });
      }
      throw new Error(`unexpected fetch ${path}`);
    }),
  );
}
