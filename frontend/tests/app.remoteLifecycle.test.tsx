import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appBackend, uuCalls } from "./appBackendFixture.js";
import { FakeMediaStream, TestPeerConnection } from "./appBrowserFakes.js";
import {
  getPrimaryAction,
  openAdvancedSettings,
  openOfficeMacControl,
  startCompatibleConnection,
} from "./appTestActions.js";
import { App, cleanupAppTest, setupAppTest } from "./appTestEnvironment.js";

/**
 * 等**浏览器会话**真正连上。
 *
 * 容易踩的坑：`expectSignalState("已连接")` 看的是诊断抽屉里的「信令状态」，
 * 那是**信令网关**的状态；而顶栏的状态药丸、「断开」按钮取决于会话的 `stage`。
 * 网关连上、answer 还没回来时，会话仍停在 `offered`。凡是要对会话做事
 * （关数据通道、点断开）的用例，都必须等这个，而不是等网关或等某个请求发出。
 *
 * 顶栏出现「断开」按钮 ⟺ `stage === "connected"`（`canDisconnectRemote` 成立且不在协商中）。
 */
async function waitForConnectionEstablished(): Promise<void> {
  await screen.findByRole("button", { name: "断开" }, { timeout: 5_000 });
}

describe("App remote lifecycle", () => {
  beforeEach(setupAppTest);
  afterEach(cleanupAppTest);

  it("preserves a control page deep link while restoring login state on refresh", async () => {
    window.history.replaceState(null, "", "/devices/desktop-1/control");

    render(<App />);

    await screen.findByRole("heading", { name: "Office Mac" }, { timeout: 5_000 });
    expect(window.location.pathname).toBe("/devices/desktop-1/control");
    expect(screen.getByRole("application", { name: "远控画面" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "我的设备" })).not.toBeInTheDocument();
  });

  it("defers room join until the operator starts the connection from the control page", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "我的设备" });
    await user.click(await screen.findByRole("button", { name: /连接 Office Mac/ }));
    await screen.findByRole("heading", { name: "Office Mac" });

    expect(uuCalls("/api/v1/room/join/by_device/desktop-1")).toHaveLength(0);
    await startCompatibleConnection(user);

    await waitFor(() => {
      expect(uuCalls("/api/v1/room/join/by_device/desktop-1")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/start")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
    });
  });

  it("joins a room by device with the selected join mode and route policy", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await openAdvancedSettings(user);
    await user.click(screen.getByRole("radio", { name: "兼容模式" }));
    await user.click(screen.getByRole("radio", { name: "接管控制" }));
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "接管控制" })).toBeChecked();
    });
    await user.click(getPrimaryAction("接管并开始连接"));
    await waitFor(() => {
      expect(uuCalls("/api/v1/room/join/by_device/desktop-1")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/start")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
    });
  });

  it("starts the remote view from the connection action without a second click", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);

    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/start")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
    });
    expect(screen.queryByRole("button", { name: "打开远控画面" })).not.toBeInTheDocument();
  });

  it("starts the signal gateway from the first room signal entry", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    appBackend.currentSignalServers = ["wss://signal-a.example", "wss://signal-b.example"];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);

    await waitFor(() => {
      const startCalls = appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/start");
      expect(startCalls.at(-1)?.body).toMatchObject({ gzipSdp: false });
      expect(startCalls.at(-1)?.body).toHaveProperty("roomConfig.token", "room-token-1");
    });
    expect(screen.getByText("wss://signal-a.example")).toBeInTheDocument();
  });

  it("asks the operator to rejoin the room when the signal gateway rejects a stale RoomConfig", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    appBackend.signalStartError = true;
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);

    await screen.findByText("连接失败：websocket error");
    expect(getPrimaryAction("重新开始连接")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "打开远控画面" })).not.toBeInTheDocument();
  });

  it("shows the upstream room join blocker when the service refuses an occupied target", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.joinRoomFailure = true;
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user, { waitForReady: false });
    await user.click(getPrimaryAction("开始连接"));
    await user.click(await screen.findByRole("button", { name: /^接管控制/ }));

    await waitFor(() => {
      expect(document.body.textContent).toContain("服务端拒绝加入房间");
    });
    expect(screen.queryByRole("button", { name: "打开远控画面" })).not.toBeInTheDocument();
  });

  it("respects service-requested relay while the operator keeps automatic routing", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentControlForceRelay = true;
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await openAdvancedSettings(user);
    await user.click(screen.getByRole("radio", { name: "兼容模式" }));
    expect(screen.getByRole("radio", { name: "自动路径" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "接管控制" }));
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "接管控制" })).toBeChecked();
    });
    await user.click(getPrimaryAction("接管并开始连接"));
    await waitFor(() => {
      expect(uuCalls("/api/v1/room/join/by_device/desktop-1")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(screen.getAllByText("接管加入").length).toBeGreaterThan(0);
    });
    await waitForConnectionEstablished();
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
    });
    expect(screen.queryByRole("button", { name: "打开远控画面" })).not.toBeInTheDocument();

    expect(TestPeerConnection.lastConfiguration).toMatchObject({ iceTransportPolicy: "all" });
    expect(screen.getByRole("radio", { name: "自动路径" })).toBeChecked();
    expect(screen.getAllByText("服务端要求中转").length).toBeGreaterThan(0);
  });

  it("auto-enables remote input control once the control channel opens", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);
    await waitForConnectionEstablished();
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
    });
    expect(screen.queryByRole("button", { name: "打开远控画面" })).not.toBeInTheDocument();

    // 连接后默认进入控制状态：自动启用输入控制并聚焦画面，无需手动点一下。
    const controlSegment = await screen.findByRole("button", { name: "控制中" });
    expect(controlSegment).toHaveAttribute("aria-pressed", "true");
    expect(document.activeElement).toHaveAttribute("aria-label", "远控画面");

    // 忠实按键:普通键在 keydown 即同步发「按下+抬起」一对(瞬时一击)，不在被控端留下“按住”状态。
    const controlSentBefore = TestPeerConnection.sentByLabel.CONTROL_DATA_CHANNEL?.length ?? 0;
    await user.keyboard("a");
    const controlSentAfter = TestPeerConnection.sentByLabel.CONTROL_DATA_CHANNEL?.length ?? 0;
    expect(controlSentAfter - controlSentBefore).toBeGreaterThanOrEqual(2);

    // 点“仅查看”暂停操作，开关切回仅查看态。
    await user.click(screen.getByRole("button", { name: "仅查看" }));
    expect(screen.getByRole("button", { name: "仅查看" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "控制中" })).toHaveAttribute("aria-pressed", "false");
  });

  it("surfaces one-click reconnect after the control channel drops and reuses the current room", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);
    /*
     * 必须等**会话**真正连上（顶栏出现「断开」即 stage=connected），不能只等
     * `/signal/control` 请求发出：那时 answer 还没回来、stage 还是 offered，
     * 此时关通道，恢复判定（要求 stage=connected）不成立，「控制连接已断开」永不出现。
     */
    await waitForConnectionEstablished();
    await user.click(screen.getByRole("tab", { name: "状态" }));
    await user.click(screen.getByRole("checkbox", { name: "自动重连" }));

    TestPeerConnection.closeDataChannel("CONTROL_DATA_CHANNEL");

    await screen.findByText(/控制连接已断开/);
    const reconnectButton = screen.getByRole("button", { name: "立即重连" });
    expect(reconnectButton).toBeEnabled();

    await user.click(reconnectButton);

    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(2);
    });
    expect(uuCalls("/api/v1/room/join/by_device/desktop-1")).toHaveLength(1);
    expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/start")).toHaveLength(1);
  });

  it("auto reconnects recoverable sessions without rejoining the UU room", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);
    await waitForConnectionEstablished();

    TestPeerConnection.closeDataChannel("CONTROL_DATA_CHANNEL");

    await waitFor(
      () => {
        expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(2);
      },
      { timeout: 2500 },
    );
    expect(uuCalls("/api/v1/room/join/by_device/desktop-1")).toHaveLength(1);
  });

  it("returns to the device list after the topbar disconnect action", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);
    /*
     * 这里不能只等 `expectSignalState("已连接")` —— 那一行反映的是**信令网关**是否连上
     * （诊断抽屉里的「信令状态」），与会话 stage 无关。网关连上但 answer 还没回来时，
     * 顶栏仍是「连接中」，自然没有「断开」按钮。等会话真正进入 connected 才稳。
     */
    await waitForConnectionEstablished();

    await user.click(screen.getByRole("button", { name: "断开" }));

    await waitFor(() => {
      expect(appBackend.requestLog.some((call) => call.method === "DELETE" && call.path === "/api/remote/signal")).toBe(
        true,
      );
    });
    const deleteCallIndex = appBackend.requestLog.findIndex(
      (call) => call.method === "DELETE" && call.path === "/api/remote/signal",
    );
    await waitFor(() => {
      expect(
        appBackend.requestLog
          .slice(deleteCallIndex + 1)
          .some((call) => call.method === "GET" && call.path === "/api/v1/device/groups/of/my"),
      ).toBe(true);
    });
    expect(TestPeerConnection.closed).toBe(true);
    // 断开是结束动作：不该停在黑屏的控制页，直接回设备列表。
    await screen.findByRole("heading", { name: "我的设备" });
    expect(screen.queryByRole("button", { name: "断开" })).not.toBeInTheDocument();
  });

  it("keeps the session alive when leaving the control page for the device list", async () => {
    /* 只盯真实的远控连接。
     * TestPeerConnection.closed 是全局标记，而 useRemoteControlPreferences 在挂载时
     * 会新建一个探针 PeerConnection 再立即 close 掉（用于探测 WebRTC 是否可用），
     * 那个探针也会把闭标记打成 true，用它判断"会话是否被关掉"会误报。
     * 这里给真实连接单独记一份实例级 closed，断言它本人没被关。 */
    const livePeers: TrackedPeerConnection[] = [];
    class TrackedPeerConnection extends TestPeerConnection {
      closedItself = false;
      constructor(configuration?: RTCConfiguration) {
        super(configuration);
        // 探针只传 { iceServers: [] }，远控连接会带上完整的 RTCConfiguration（含 iceTransportPolicy）。
        if (configuration && "iceTransportPolicy" in configuration) livePeers.push(this);
      }
      close(): void {
        this.closedItself = true;
        super.close();
      }
    }

    vi.stubGlobal("RTCPeerConnection", TrackedPeerConnection);
    appBackend.currentParticipants = [];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);
    /*
     * 等**会话**连上（顶栏出现「断开」），不要等信令网关的「已连接」——
     * 那是诊断抽屉里的网关状态，answer 还没回来时它就已经是「已连接」了。
     * 这里的断言全部围绕会话 stage，前置条件必须同源。
     */
    await waitForConnectionEstablished();
    expect(livePeers).toHaveLength(1);
    const sessionPeer = livePeers[0];
    expect(sessionPeer.closedItself).toBe(false);

    await user.click(screen.getByRole("button", { name: "返回设备列表" }));

    await screen.findByRole("heading", { name: "我的设备" });
    expect(window.location.pathname).toBe("/devices");
    // 返回只是切视图：不能释放网关、不能关 WebRTC 会话，否则就退回"离开即断开"了。
    expect(appBackend.requestLog.some((call) => call.method === "DELETE" && call.path === "/api/remote/signal")).toBe(
      false,
    );
    expect(sessionPeer.closedItself).toBe(false);

    // 列表顶部出现这条连接，点回来还是同一个会话，不需要重新加入房间。
    const tab = await screen.findByRole("tab", { name: /Office Mac/ });
    await user.click(tab);
    await screen.findByRole("heading", { name: "Office Mac" });
    expect(window.location.pathname).toBe("/devices/desktop-1/control");
    expect(uuCalls("/api/v1/room/join/by_device/desktop-1")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "我的设备" })).not.toBeInTheDocument();
    // 点回来也没有重建连接，仍是同一个 PeerConnection 且依然活着。
    expect(livePeers).toEqual([sessionPeer]);
    expect(sessionPeer.closedItself).toBe(false);

    /*
     * 关键：切回来必须是「已连接」，不能退回「已就绪」。
     *
     * 会话存活在组件 useRef 里时，虽然没人调 close()、连接本身还活着，
     * 但页面卸载就把**唯一指向它的句柄**丢了 —— 切回来 stage 回到 idle，
     * 界面显示"已就绪，点开始连接"，顶栏也没有「断开」。
     * 顶栏的「断开」按钮 ⟺ stage === "connected"，用它兜住这个契约。
     */
    await screen.findByRole("button", { name: "断开" }, { timeout: 5_000 });
    expect(screen.queryByText(/已就绪，点/)).not.toBeInTheDocument();
    // 没有重新 start：control 握手只发生过一次。
    expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
  });

  /*
   * 这条用例钉住一个真实踩过的坑：连接要活过页面。
   *
   * 信令轮询原本挂在远控页的 useEffect 里，离开页面就被 clearInterval，
   * 服务端信令没人拉，被控端判定主控离线并主动结束会话 —— 表现就是
   * "点返回设备列表，连接就断了"，而代码里看起来只是 navigate 了一下。
   *
   * 所以这里断言的是：停在设备列表期间，仍然有 /api/remote/signal/events 请求。
   */
  it("keeps polling the signal gateway after leaving the control page", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);
    await waitForConnectionEstablished();

    await user.click(screen.getByRole("button", { name: "返回设备列表" }));
    await screen.findByRole("heading", { name: "我的设备" });

    const pollingCount = () =>
      appBackend.requestLog.filter((call) => call.path.startsWith("/api/remote/signal/events")).length;
    const before = pollingCount();

    // 已连接态 1500ms 一轮；等够两轮，确认在设备列表页上轮询没有停。
    await waitFor(
      () => {
        expect(pollingCount()).toBeGreaterThan(before);
      },
      { timeout: 5_000 },
    );
    expect(appBackend.requestLog.some((call) => call.method === "DELETE" && call.path === "/api/remote/signal")).toBe(
      false,
    );
  });

  it("tears the session down when the connection tab is closed from the device list", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);
    await waitForConnectionEstablished();

    await user.click(screen.getByRole("button", { name: "返回设备列表" }));
    await screen.findByRole("heading", { name: "我的设备" });

    await user.click(await screen.findByRole("button", { name: /断开并关闭 Office Mac/ }));

    // 页签的 × 才是真断开：停网关、关会话、页签消失。
    await waitFor(() => {
      expect(appBackend.requestLog.some((call) => call.method === "DELETE" && call.path === "/api/remote/signal")).toBe(
        true,
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("tab", { name: /Office Mac/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "我的设备" })).toBeInTheDocument();
  });

  it("keeps extra incoming video tracks out of the main remote-control surface", async () => {
    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    appBackend.remoteTrackPlan = [
      { id: "blank-video", kind: "video" },
      { id: "desktop-video", kind: "video" },
      { id: "remote-audio", kind: "audio" },
    ];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);
    await waitForConnectionEstablished();
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
    });
    expect(screen.queryByRole("button", { name: "打开远控画面" })).not.toBeInTheDocument();

    await screen.findByLabelText("远控画面视频");
    expect(screen.queryByLabelText("远控视频 2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "状态" }));
    expect(screen.getByRole("region", { name: "画面源" })).toBeInTheDocument();
    // 远控画面不再叠状态角标，画面源数量改由「画面源」面板呈现。
    expect(screen.getByText(/画面源 · 2 路/)).toBeInTheDocument();
  });
});
