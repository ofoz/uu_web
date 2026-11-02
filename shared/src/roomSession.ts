import type { StreamerRoomConfigSummary } from "./roomConfig.js";

export interface RoomJoinUpstreamSummary {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  body: {
    code?: number;
    msg?: string;
    dataKeys?: string[];
  };
}

export interface RoomJoinResult {
  upstream: RoomJoinUpstreamSummary;
  roomConfig: null;
  roomConfigSummary: StreamerRoomConfigSummary | null;
  sessionReference: {
    browserStoragePath: string;
    summaryPath: string;
  };
}

export type RoomJoinKind = "owned_device" | "remote_assistance";

export type RemoteAssistanceControlMode = "by_password" | "by_confirmation" | "password_confirmation";

export interface RemoteRoomJoinContext {
  capturedAt: string;
  kind?: RoomJoinKind;
  deviceId: string;
  forceJoin: boolean;
  connectId?: string;
  connectCodeProvided?: boolean;
  controlId?: string;
  controlMode?: RemoteAssistanceControlMode | null;
  deviceName?: string;
  targetPlatform?: number;
}

export interface RemoteAssistanceJoinInput {
  connectId: string;
  connectCode?: string;
  controlId?: string;
  controlMode?: RemoteAssistanceControlMode | null;
}

export interface RemoteAssistanceJoinResult extends RoomJoinResult {
  assistance: {
    connectId: string;
    connectCodeProvided: boolean;
    confirmationRequired: boolean;
    usedConfirmation: boolean;
    controlId?: string;
    controlMode?: RemoteAssistanceControlMode | null;
    deviceName?: string;
    targetPlatform?: number;
  };
}

export interface RemoteAssistanceControlModeResult {
  upstream: RoomJoinUpstreamSummary;
  connectId: string;
  canRemoteControl: boolean;
  controlMode: RemoteAssistanceControlMode | null;
}

export interface RoomAppFlagUpdateInput {
  publisherDeviceId: string;
  controlMode: string | null;
}

export interface RoomAppFlagUpdateResult {
  upstream: RoomJoinUpstreamSummary;
  appFlag: {
    controlMode: string | null;
  };
}
