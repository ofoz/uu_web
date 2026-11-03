import { cleanup } from "@testing-library/react";
import { vi } from "vitest";

import AppComponent from "../src/App.js";
import { resetConnections } from "../src/remote/remoteConnectionsStore.js";
import { resetRemoteAudioStreamStore } from "../src/remote/remoteAudioStreamStore.js";
import { resetRemoteSessionEventBridge } from "../src/remote/remoteSessionEventBridge.js";
import { resetRemoteSessionStore } from "../src/remote/remoteSessionStore.js";
import { resetRemoteVideoStreamsStore } from "../src/remote/remoteVideoStreamsStore.js";
import { resetAllSignalPolling } from "../src/remote/signalPolling.js";
import { appBackend, handleFetch } from "./appBackendFixture.js";
import { TestPeerConnection } from "./appBrowserFakes.js";

export const App = AppComponent;

const clipboardMocks = vi.hoisted(() => ({
  read: vi.fn(async () => ""),
  write: vi.fn(async (_text: string) => undefined),
}));
export const readLocalClipboardTextMock = clipboardMocks.read;
export const writeLocalClipboardTextMock = clipboardMocks.write;

vi.mock("../src/browser/clipboard.js", () => ({
  getLocalClipboardAccessIssue: () => null,
  readLocalClipboardText: readLocalClipboardTextMock,
  writeLocalClipboardText: writeLocalClipboardTextMock,
}));

export const authReady = {
  hasState: true,
  missingFields: [],
  userId: "user-1",
  clientId: "client-1",
  deviceId: "web-device-1",
  channel: "official",
};

export function setupAppTest(): void {
  appBackend.requestLog = [];
  appBackend.joinRoomFailure = false;
  appBackend.lastControlIceId = "";
  appBackend.currentControlForceRelay = false;
  appBackend.currentAssistControlMode = "by_password";
  appBackend.currentAssistPlatformFields = { publisher_platform: 4, device_platform: 2, platform: 1 };
  appBackend.assistCodeRequiresConfirmation = false;
  appBackend.currentSignalServers = ["wss://signal.example"];
  appBackend.signalStartError = false;
  appBackend.remoteTrackPlan = [];
  appBackend.currentParticipants = [
    {
      client_id: "client-phone-1",
      device_id: "phone-1",
      alias: "iPhone",
      platform: 3,
      user_join_type: 1,
      controlled_time: 180,
      app_flag: { control_mode: "second_screen" },
    },
    {
      client_id: "client-mac-1",
      device_id: "mac-1",
      alias: "Studio Mac",
      platform: 4,
      user_join_type: 1,
      controlled_time: 180,
      app_flag: { control_mode: null },
    },
  ];
  appBackend.currentRemoteSignalEvents = [
    {
      id: 1,
      direction: "inbound",
      event: "soac",
      receivedAt: "2026-05-14T00:00:00.200Z",
      payload: [
        {
          client_id: "controlled-1",
          data: {
            type: "answer",
            sdp: "v=0 answer",
          },
        },
      ],
    },
  ];
  TestPeerConnection.lastConfiguration = null;
  TestPeerConnection.current = null;
  TestPeerConnection.sentByLabel = {};
  TestPeerConnection.channels = {};
  TestPeerConnection.closed = false;
  TestPeerConnection.statsReports = [];
  readLocalClipboardTextMock.mockReset();
  readLocalClipboardTextMock.mockResolvedValue("");
  writeLocalClipboardTextMock.mockReset();
  writeLocalClipboardTextMock.mockResolvedValue(undefined);
  window.localStorage.clear();
  window.localStorage.setItem("uurc.autoConnect", "false");
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/devices");
  seedLoginState(authReady);
  vi.stubGlobal("fetch", vi.fn(handleFetch));
}

export function cleanupAppTest(): void {
  cleanup();
  vi.unstubAllGlobals();
  /*
   * 连接仓是模块级单例（真实运行时就该如此，连接要活过页面）。
   * 但测试里它会在用例之间串味：上一例连过的设备会被下一例当成"已连接"，
   * 于是不再触发加入房间，断言全落空。这里每例结束清一次。
   */
  resetConnections();
  /* 信令轮询器同为模块级且故意不随页面卸载停止，测试里必须显式清掉，否则定时器跨用例存活。 */
  resetAllSignalPolling();
  /*
   * 会话 / 画面源 / 音轨 / 事件分发器现在都是模块级的（正因为它们要活过页面），
   * 测试里不清就会串味：上一例的连接被下一例当成"已连好"，断言全落空。
   */
  resetRemoteSessionStore();
  resetRemoteVideoStreamsStore();
  resetRemoteAudioStreamStore();
  resetRemoteSessionEventBridge();
}

export function seedLoginState(status: typeof authReady): void {
  window.localStorage.setItem(
    "uurc.loginState",
    JSON.stringify({
      token: "header.payload.signature",
      userId: status.userId,
      clientId: status.clientId,
      deviceId: status.deviceId,
      channel: status.channel,
    }),
  );
}
