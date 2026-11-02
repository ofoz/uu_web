import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appBackend, uuCalls } from "./appBackendFixture.js";
import { TestPeerConnection } from "./appBrowserFakes.js";
import {
  expectSignalState,
  getPrimaryAction,
  openAdvancedSettings,
  openOfficeMacControl,
  startCompatibleConnection,
} from "./appTestActions.js";
import { App, cleanupAppTest, setupAppTest } from "./appTestEnvironment.js";

describe("App remote readiness", () => {
  beforeEach(setupAppTest);
  afterEach(cleanupAppTest);

  it("surfaces a productized remote readiness diagnosis when the controlled side leaves before answer", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentRemoteSignalEvents = [
      {
        id: 1,
        direction: "outbound",
        event: "control",
        receivedAt: "2026-05-14T00:00:00.000Z",
        payload: { app_control_id: "control-1" },
      },
      {
        id: 2,
        direction: "inbound",
        event: "control:ack",
        receivedAt: "2026-05-14T00:00:00.050Z",
        payload: ["success", { code: 0 }],
      },
      {
        id: 3,
        direction: "outbound",
        event: "soac",
        receivedAt: "2026-05-14T00:00:00.100Z",
        payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
      },
      {
        id: 4,
        direction: "inbound",
        event: "leave",
        receivedAt: "2026-05-14T00:00:00.200Z",
        payload: [{ ice_id: "ice-1", "ntes-trace-id": "trace-server-kick-1" }],
      },
      {
        id: 5,
        direction: "inbound",
        event: "switch_network_notify",
        receivedAt: "2026-05-14T00:00:00.250Z",
        payload: [{ transport_type: 3, attempt_switch_type: 2, ice_id: "ice-1" }],
      },
    ];
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
      expect(screen.getAllByText("接管加入").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expectSignalState("已连接");
    });
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
    });
    expect(screen.queryByRole("button", { name: "打开远控画面" })).not.toBeInTheDocument();

    await screen.findByText("远控诊断");
    await screen.findByText("受控端离开，未收到 answer");
    await screen.findByText("服务端断开 · leave · trace-server-kick-1 · ice=matched");
    await screen.findByText("transport=3 · attempt=2 · ice=yes");
    expect(screen.getByText("连接确认已收到")).toBeInTheDocument();
    expect(screen.getByText("offer 已发送")).toBeInTheDocument();
    expect(appBackend.requestLog.some((call) => call.path === "/api/remote/signal/diagnostics")).toBe(true);
  });

  it("labels missing answer as waiting for the controlled session", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentRemoteSignalEvents = [
      {
        id: 1,
        direction: "outbound",
        event: "control",
        receivedAt: "2026-05-14T00:00:00.000Z",
        payload: { app_control_id: "control-1" },
      },
      {
        id: 2,
        direction: "inbound",
        event: "control:ack",
        receivedAt: "2026-05-14T00:00:00.050Z",
        payload: ["success", { code: 0 }],
      },
      {
        id: 3,
        direction: "outbound",
        event: "soac",
        receivedAt: "2026-05-14T00:00:00.100Z",
        payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
      },
    ];
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
      expect(screen.getAllByText("接管加入").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expectSignalState("已连接");
    });
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
    });
    expect(screen.queryByRole("button", { name: "打开远控画面" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("等待受控端 answer").length).toBeGreaterThan(0);
    });
    await screen.findByText("受控端回包未到达");
  });

  it("recommends explicit takeover when a normal join leaves before answer", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentParticipants = [];
    appBackend.currentRemoteSignalEvents = [
      {
        id: 1,
        direction: "outbound",
        event: "control",
        receivedAt: "2026-05-14T00:00:00.000Z",
        payload: { app_control_id: "control-1" },
      },
      {
        id: 2,
        direction: "inbound",
        event: "control:ack",
        receivedAt: "2026-05-14T00:00:00.050Z",
        payload: ["success", { code: 0 }],
      },
      {
        id: 3,
        direction: "outbound",
        event: "soac",
        receivedAt: "2026-05-14T00:00:00.100Z",
        payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
      },
      {
        id: 4,
        direction: "inbound",
        event: "leave",
        receivedAt: "2026-05-14T00:00:00.200Z",
        payload: [{ ice_id: "ice-1" }],
      },
    ];
    const user = userEvent.setup();
    render(<App />);

    await openOfficeMacControl(user);
    await startCompatibleConnection(user);
    await waitFor(() => {
      expectSignalState("已连接");
    });
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
    });
    expect(screen.queryByRole("button", { name: "打开远控画面" })).not.toBeInTheDocument();

    await screen.findByText("answer 未返回");
    await screen.findByText("受控端回包未到达");
    await screen.findByText("画面未返回。");
    expect(screen.getByRole("radio", { name: "普通加入" })).toBeChecked();
  });

  it("surfaces a failed be-controlled ControlResult before waiting for answer", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentRemoteSignalEvents = [
      {
        id: 1,
        direction: "outbound",
        event: "control",
        receivedAt: "2026-05-14T00:00:00.000Z",
        payload: { app_control_id: "control-1" },
      },
      {
        id: 2,
        direction: "inbound",
        event: "control:ack",
        receivedAt: "2026-05-14T00:00:00.050Z",
        payload: ["success", { code: 0 }],
      },
      {
        id: 3,
        direction: "outbound",
        event: "soac",
        receivedAt: "2026-05-14T00:00:00.100Z",
        payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
      },
      {
        id: 4,
        direction: "inbound",
        event: "be-controlled",
        receivedAt: "2026-05-14T00:00:00.150Z",
        payload: [{ code: 100001, msg: "occupied" }],
      },
    ];
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
      expect(screen.getAllByText("接管加入").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expectSignalState("已连接");
    });
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
    });
    expect(screen.queryByRole("button", { name: "打开远控画面" })).not.toBeInTheDocument();

    await screen.findByText("be-controlled 返回失败");
    await screen.findByText("code=100001 · protocol=protocol_error_2021 · msg=occupied");
    expect(screen.getByText("be-controlled 失败")).toBeInTheDocument();
    expect(screen.queryByText("等待受控端 SetRemoteOffer/answer")).not.toBeInTheDocument();
  });

  it("surfaces a failed control ack before sending an offer", async () => {
    vi.stubGlobal("RTCPeerConnection", TestPeerConnection);
    appBackend.currentRemoteSignalEvents = [
      {
        id: 1,
        direction: "outbound",
        event: "control",
        receivedAt: "2026-05-14T00:00:00.000Z",
        payload: { app_control_id: "control-1" },
      },
      {
        id: 2,
        direction: "inbound",
        event: "control:ack",
        receivedAt: "2026-05-14T00:00:00.050Z",
        payload: ["fail", { code: 100002, msg: "rejected" }],
      },
    ];
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
      expect(screen.getAllByText("接管加入").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expectSignalState("已连接");
    });
    await waitFor(() => {
      expect(appBackend.requestLog.filter((call) => call.path === "/api/remote/signal/control")).toHaveLength(1);
    });
    await openAdvancedSettings(user);

    // 信令事件由后台自动轮询同步（已无手动同步入口），等待轮询应用 control:ack 失败事件。
    await screen.findByText("ack=fail · code=100002 · protocol=protocol_error_2022 · msg=rejected", undefined, {
      timeout: 3000,
    });
    expect(screen.getAllByText("连接确认失败").length).toBeGreaterThan(0);
  });
});
