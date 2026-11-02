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
  handoff: RemoteControlHandoff | null;
  onDevicesChange: (devices: UuDeviceGroups) => void;
  onControlLeave: () => void;
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
