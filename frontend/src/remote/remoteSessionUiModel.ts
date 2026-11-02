import type { BusyAction, NextAction } from "../app/remoteControlTypes.js";
import type { BrowserRemoteSessionState } from "./browserRemoteSessionTypes.js";

export function createIdleBrowserRemoteState(): BrowserRemoteSessionState {
  return {
    appControlId: "",
    connectionPath: "unknown",
    dataChannels: {},
    debugEvents: [],
    remoteTrackCount: 0,
    stage: "idle",
  };
}

export function getNextAction(input: {
  busy: BusyAction;
  browserConnectionRecoverable: boolean;
  browserStage: BrowserRemoteSessionState["stage"];
  controlChannelState: RTCDataChannelState;
  deviceTotal: number;
  inputControlActive: boolean;
  loggedIn: boolean;
  forceJoin: boolean;
  roomJoinedForSelectedDevice: boolean;
  remoteAssistanceTarget: boolean;
  roomRequiresTakeover: boolean;
  selectedDeviceId: string;
  selectedDeviceIsCurrentAuthDevice: boolean;
  signalGatewayErrored: boolean;
  signalGatewayMatchesRoom: boolean;
}): NextAction {
  if (!input.loggedIn) return action("登录账号", input.busy !== null);
  if (!input.selectedDeviceId || (!input.remoteAssistanceTarget && input.deviceTotal === 0)) {
    return action("刷新设备", input.busy !== null);
  }
  if (input.selectedDeviceIsCurrentAuthDevice) return action("更换账号", true, "不能控制本机");
  if (input.roomRequiresTakeover) return action("接管并开始连接", input.busy !== null);
  if (!input.roomJoinedForSelectedDevice) {
    return action(input.forceJoin ? "接管并开始连接" : "开始连接", input.busy !== null);
  }
  if (input.signalGatewayErrored) return action("重新开始连接", input.busy !== null);
  if (!input.signalGatewayMatchesRoom || input.browserStage === "idle") {
    return action("开始连接", input.busy !== null);
  }
  if (input.browserStage !== "connected") return action("等待画面", true);
  if (input.browserConnectionRecoverable) return action("重新连接", input.busy !== null);
  if (!input.inputControlActive && input.controlChannelState === "open") {
    return action("开始操作", input.busy !== null);
  }
  return action("远控进行中", true);
}

export function createAppControlId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `web-${Date.now().toString(36)}`;
}

export function formatInboundVideoStats(stats: BrowserRemoteSessionState["inboundVideo"]): string {
  if (!stats) return "-";
  const parts = [
    stats.codecMimeType,
    stats.decoderImplementation,
    stats.framesDecoded === undefined ? null : `decoded=${stats.framesDecoded}`,
    stats.framesReceived === undefined ? null : `received=${stats.framesReceived}`,
    stats.packetsReceived === undefined ? null : `pkt=${stats.packetsReceived}`,
    stats.bytesReceived === undefined ? null : `bytes=${stats.bytesReceived}`,
    stats.freezeCount === undefined ? null : `freeze=${stats.freezeCount}`,
    stats.pliCount === undefined ? null : `pli=${stats.pliCount}`,
    stats.nackCount === undefined ? null : `nack=${stats.nackCount}`,
    stats.framesPerSecond === undefined ? null : `fps=${stats.framesPerSecond}`,
    stats.frameWidth && stats.frameHeight ? `${stats.frameWidth}x${stats.frameHeight}` : null,
  ].filter((item): item is string => item !== null);
  return parts.length > 0 ? parts.join(" · ") : "-";
}

export function formatInboundAudioStats(stats: BrowserRemoteSessionState["inboundAudio"]): string {
  if (!stats) return "-";
  const averageJitterBufferMs =
    stats.jitterBufferDelay !== undefined && stats.jitterBufferEmittedCount
      ? Math.round((stats.jitterBufferDelay / stats.jitterBufferEmittedCount) * 1000)
      : undefined;
  const parts = [
    stats.codecMimeType,
    stats.codecClockRate === undefined
      ? null
      : `${stats.codecClockRate}Hz${stats.codecChannels ? `/${stats.codecChannels}ch` : ""}`,
    stats.packetsReceived === undefined ? null : `pkt=${stats.packetsReceived}`,
    stats.packetsLost === undefined ? null : `lost=${stats.packetsLost}`,
    stats.bytesReceived === undefined ? null : `bytes=${stats.bytesReceived}`,
    stats.jitter === undefined ? null : `jitter=${Math.round(stats.jitter * 1000)}ms`,
    averageJitterBufferMs === undefined ? null : `buffer=${averageJitterBufferMs}ms`,
    stats.totalSamplesReceived === undefined ? null : `samples=${stats.totalSamplesReceived}`,
    stats.concealedSamples === undefined ? null : `concealed=${stats.concealedSamples}`,
  ].filter((item): item is string => item !== null);
  return parts.length > 0 ? parts.join(" · ") : "-";
}

export function formatAudioElement(sample: BrowserRemoteSessionState["audioElement"]): string {
  if (!sample) return "-";
  return [
    sample.event,
    `${sample.currentTimeMs}ms`,
    sample.readyState === undefined ? null : `ready=${sample.readyState}`,
    sample.paused === undefined ? null : `paused=${sample.paused}`,
    sample.muted === undefined ? null : `muted=${sample.muted}`,
    sample.volume === undefined ? null : `volume=${Math.round(sample.volume * 100)}%`,
    sample.autoplayBlocked ? "autoplay=blocked" : null,
    sample.errorName ? `error=${sample.errorName}` : null,
  ]
    .filter((item): item is string => item !== null)
    .join(" · ");
}

export function formatVideoFlow(state: BrowserRemoteSessionState): string {
  const flow = state.videoFlow;
  if (!flow) return state.stage === "connected" ? "连接中" : "-";
  switch (flow.status) {
    case "receiving":
      return "播放中";
    case "decode_stalled":
      return "画面卡顿";
    case "presentation_stalled":
      return "画面呈现停滞";
    case "transport_stalled":
      return "画面中断";
    case "waiting":
    default:
      return "等待画面";
  }
}

export function formatVideoElement(sample: BrowserRemoteSessionState["videoElement"]): string {
  if (!sample) return "-";
  return [
    sample.event,
    `${sample.currentTimeMs}ms`,
    sample.totalVideoFrames === undefined ? null : `frames=${sample.totalVideoFrames}`,
    sample.presentedFrames === undefined ? null : `presented=${sample.presentedFrames}`,
    sample.droppedVideoFrames === undefined ? null : `drop=${sample.droppedVideoFrames}`,
    sample.readyState === undefined ? null : `ready=${sample.readyState}`,
    sample.width && sample.height ? `${sample.width}x${sample.height}` : null,
    sample.errorCode === undefined ? null : `mediaError=${sample.errorCode}`,
    sample.errorName ? `playError=${sample.errorName}` : null,
  ]
    .filter((item): item is string => item !== null)
    .join(" · ");
}

export function formatBrowserRemoteStage(stage: BrowserRemoteSessionState["stage"]): string {
  switch (stage) {
    case "idle":
      return "未启动";
    case "controlled":
      return "已授权";
    case "offered":
      return "协商中";
    case "connected":
      return "已连接";
    default:
      return stage;
  }
}

interface ConnectingStageStep {
  key: "signal" | "negotiate" | "video";
  label: string;
  status: "done" | "active" | "pending";
}

export function getConnectingStageSteps(
  browserStage: BrowserRemoteSessionState["stage"],
  hasRemoteVideo: boolean,
): ConnectingStageStep[] {
  const negotiateDone = browserStage === "connected";
  const videoDone = negotiateDone && hasRemoteVideo;
  return [
    { key: "signal", label: "信令已连接", status: "done" },
    { key: "negotiate", label: "媒体协商中", status: negotiateDone ? "done" : "active" },
    { key: "video", label: "等待画面", status: videoDone ? "done" : negotiateDone ? "active" : "pending" },
  ];
}

export function formatConnectionPath(path: BrowserRemoteSessionState["connectionPath"]): string {
  switch (path) {
    case "lan":
      return "局域网";
    case "p2p":
      return "直连";
    case "relay":
      return "UU 中转";
    case "unknown":
    default:
      return "未知";
  }
}

export function formatDataChannelState(state: string): string {
  switch (state) {
    case "connecting":
      return "连接中";
    case "open":
      return "已打开";
    case "closing":
      return "关闭中";
    case "closed":
      return "已关闭";
    default:
      return state;
  }
}

function action(label: string, disabled: boolean, detail = ""): NextAction {
  return { label, detail, disabled };
}
