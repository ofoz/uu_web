export const STREAMER_CONTROL_CONNECT_TYPES = {
  ControlConnectType_UNKNOWN: 0,
  ControlConnectType_Normal: 1,
  ControlConnectType_Assistance: 2,
} as const;

export const STREAMER_CLIENT_TYPES = {
  Client_UNSPECIFIED: 0,
  Client_IOS: 1,
  Client_ANDROID: 2,
  Client_WINDOWS: 3,
  Client_MAC: 4,
} as const;

export interface StreamerScreenResolutionInput {
  width: number;
  height: number;
}

export interface StreamerVirtualDisplayModeInput extends StreamerScreenResolutionInput {
  fps?: number;
}
