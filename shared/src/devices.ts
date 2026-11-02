export interface UuDevice {
  deviceId: string;
  alias: string;
  controllable: boolean;
  platform?: number;
  status?: string;
  versionName?: string;
  supportWol?: boolean;
  controlledSupport?: boolean;
  appFlag?: unknown;
  participantsInfo?: UuParticipantInfo[];
  raw: Record<string, unknown>;
}

export interface UuParticipantInfo {
  clientId: string;
  deviceId: string;
  alias: string;
  platform?: number;
  joinType?: number;
  controlledSeconds?: number;
  appFlag?: unknown;
}

export interface UuDeviceGroups {
  desktopDevices: UuDevice[];
  mobileDevices: UuDevice[];
  tvDevices: UuDevice[];
}
