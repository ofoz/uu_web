import { describe, expect, it } from "vitest";

import type { RoomJoinResult } from "@uurc/shared/roomSession";

import type { RoomJoinContext } from "../src/app/remoteControlTypes.js";
import type { BrowserRemoteSessionState } from "../src/remote/browserRemoteSessionTypes.js";
import {
  createRemoteControlPresentation,
  type RemoteControlPresentationInput,
} from "../src/remote/remoteControlPresentation.js";

const DEVICE_ID = "device-office-pc";

function device() {
  return { deviceId: DEVICE_ID, alias: "办公室PC" } as unknown as RemoteControlPresentationInput["selectedDevice"];
}

function rejectedJoinResult(msg: string): RoomJoinResult {
  return {
    upstream: { status: 200, statusText: "OK", headers: [], body: { code: 40003, msg } },
    roomConfig: null,
    roomConfigSummary: null,
    sessionReference: { browserStoragePath: "", summaryPath: "" },
  };
}

function browserState(): BrowserRemoteSessionState {
  return {
    stage: "idle",
    dataChannels: {},
    remoteTrackCount: 0,
    videoFlow: null,
    iceId: null,
    controlResult: null,
    audioElement: null,
  } as unknown as BrowserRemoteSessionState;
}

function build(overrides: Partial<RemoteControlPresentationInput> = {}): RemoteControlPresentationInput {
  return {
    authDeviceId: "self-device",
    autoReconnectEnabled: false,
    autoReconnectStatus: "",
    browserRemoteState: browserState(),
    browserWebRtcUnavailableReason: "",
    busy: null,
    connectionRouteMode: "auto",
    controlChannelState: "closed",
    decodeStalledStreak: 0,
    devices: {
      desktopDevices: [device()],
      mobileDevices: [],
      tvDevices: [],
    },
    devicesLoaded: true,
    forceJoin: false,
    inputControlActive: false,
    localSignalReadiness: {
      checks: {},
      blocker: null,
    } as unknown as RemoteControlPresentationInput["localSignalReadiness"],
    remoteBootstrap: null,
    remoteSignalDiagnostics: null,
    remoteVideoCount: 0,
    roomJoinContext: null,
    roomResponse: null,
    sdpTransportMode: "plain",
    selectedDevice: device(),
    selectedDeviceId: DEVICE_ID,
    selectedDeviceOccupied: false,
    signalEvents: [],
    signalGatewayContext: null,
    signalGatewayStatus: null,
    textChannelState: "closed",
    ...overrides,
  };
}

function takeoverContext(forceJoin: boolean): RoomJoinContext {
  return { kind: "owned_device", deviceId: DEVICE_ID, forceJoin, occupiedAtJoin: true };
}

describe("room takeover requirement", () => {
  it("服务端因占用拒绝普通加入时，切到接管动作且不再重复报错", () => {
    const presentation = createRemoteControlPresentation(
      build({
        roomJoinContext: takeoverContext(false),
        roomResponse: rejectedJoinResult("被控端正在被远程中，无法发起连接"),
        selectedDeviceOccupied: true,
      }),
    );

    expect(presentation.roomJoinedForSelectedDevice).toBe(false);
    expect(presentation.roomRequiresTakeover).toBe(true);
    expect(presentation.nextAction.label).toBe("接管并开始连接");
    // 原始报错被"点接管"提示替代，避免两条红色告警叠在一起。
    expect(presentation.roomJoinFailureNotice).toBe("");
    expect(presentation.browserRtcBlockedReason).toBe("设备被占用，点「接管并开始连接」");
  });

  it("已加入但设备被他人占用时仍要求接管", () => {
    const presentation = createRemoteControlPresentation(
      build({
        roomJoinContext: takeoverContext(false),
        roomResponse: {
          ...rejectedJoinResult(""),
          roomConfigSummary: { channels: [] } as unknown as RoomJoinResult["roomConfigSummary"],
        },
        selectedDeviceOccupied: true,
      }),
    );

    expect(presentation.roomRequiresTakeover).toBe(true);
    expect(presentation.nextAction.label).toBe("接管并开始连接");
  });

  it("接管（force）请求仍被拒时保留服务端原始报错", () => {
    const presentation = createRemoteControlPresentation(
      build({
        forceJoin: true,
        roomJoinContext: takeoverContext(true),
        roomResponse: rejectedJoinResult("被控端正在被远程中，无法发起连接"),
        selectedDeviceOccupied: true,
      }),
    );

    expect(presentation.roomRequiresTakeover).toBe(false);
    expect(presentation.roomJoinFailureNotice).toBe("服务端拒绝加入房间：被控端正在被远程中，无法发起连接");
  });

  it("设备空闲时加入失败不误判成占用接管", () => {
    const presentation = createRemoteControlPresentation(
      build({
        roomJoinContext: { ...takeoverContext(false), occupiedAtJoin: false },
        roomResponse: rejectedJoinResult("房间服务异常"),
      }),
    );

    expect(presentation.roomRequiresTakeover).toBe(false);
    expect(presentation.roomJoinFailureNotice).toBe("服务端拒绝加入房间：房间服务异常");
  });
});
