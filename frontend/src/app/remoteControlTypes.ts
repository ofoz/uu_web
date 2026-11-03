import type { AuthStatus } from "@uurc/shared/authState";
import type { UuDeviceGroups } from "@uurc/shared/devices";
import type { RemoteControlBootstrap } from "@uurc/shared/remoteBootstrap";
import type { RemoteAssistanceControlMode, RoomJoinKind, RoomJoinResult } from "@uurc/shared/roomSession";

import type { BrowserRemoteVideoElementSample } from "../remote/browserRemoteSessionTypes.js";

export type BusyAction =
  | "status"
  | "import"
  | "send-mobile-code"
  | "mobile-login"
  | "devices"
  | "assistance"
  | "join"
  | "logout"
  | "signal-start"
  | "signal-stop"
  | "browser-remote-start"
  | "reconnect"
  | "clipboard-read"
  | "signal-events"
  | null;

export type SdpTransportMode = "gzip" | "plain";
export type ConnectionRouteMode = "auto" | "relay";
export type RemoteStageViewMode = "fit" | "fill";
export type RemoteAudioPlaybackState = "idle" | "waiting" | "playing" | "blocked" | "error";

export type RoomJoinContext = {
  kind: RoomJoinKind;
  deviceId: string;
  forceJoin: boolean;
  occupiedAtJoin: boolean;
  connectId?: string;
  connectCodeProvided?: boolean;
  controlId?: string;
  controlMode?: RemoteAssistanceControlMode | null;
  deviceName?: string;
  targetPlatform?: number;
};

export interface RemoteControlHandoff {
  roomResponse: RoomJoinResult;
  roomJoinContext: RoomJoinContext;
  remoteBootstrap: RemoteControlBootstrap;
}

export interface RemoteControlContext {
  authStatus: AuthStatus | null;
  devices: UuDeviceGroups;
  devicesLoaded: boolean;
  /** 设备列表里当前选中的设备，作为路由没带 deviceId 时的兜底目标。 */
  selectedDeviceId: string;
  /**
   * 取这台设备已建立的连接（没有则 null）。
   *
   * 连接的生命周期不再跟随页面：页面卸载不会拆连接，只有「断开」或页签的 × 会。
   * 因此从远控页退回设备列表、再点另一台设备，前一台仍在后台保持。
   */
  getConnection: (deviceId: string) => RemoteControlHandoff | null;
  /** 建立/更新一条连接；deviceName 缺省时由调用方从设备列表补齐。 */
  openConnection: (deviceId: string, handoff: RemoteControlHandoff, deviceName?: string) => void;
  closeConnection: (deviceId: string) => void;
  refreshConnection: (deviceId: string, update: Partial<RemoteControlHandoff>) => void;
  onDevicesChange: (devices: UuDeviceGroups) => void;
}

export type RemoteVideoStream = {
  id: string;
  stream: MediaStream;
};

export type RemoteVideoSourceInfo = {
  id: string;
  index: number;
  resolution: string;
  hasSignal: boolean;
  /** 长期没有任何像素输出（多半是没启用的副屏/摄像头），默认在列表里折叠。 */
  silent: boolean;
};

type RemoteConnectionQualityState = "pending" | "good" | "warn" | "bad";

export type RemoteConnectionQuality = {
  state: RemoteConnectionQualityState;
  title: string;
  detail: string;
  metrics: RemoteConnectionQualityMetric[];
};

export type RemoteConnectionQualityMetric = {
  label: string;
  value: string;
};

export type NextAction = {
  label: string;
  detail: string;
  disabled: boolean;
};

export type RemoteVideoSamplesById = Record<string, BrowserRemoteVideoElementSample>;

export const SELF_DEVICE_BLOCKED_REASON = "不能控制当前设备。";
