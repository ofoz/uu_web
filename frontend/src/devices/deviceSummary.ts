import type { UuDevice, UuDeviceGroups, UuParticipantInfo } from "@uurc/shared/devices";

type UnknownRecord = Record<string, unknown>;

export function flattenDeviceGroups(input: unknown): UuDeviceGroups {
  const root = asRecord(input) ?? {};
  const body = asRecord(root.body) ?? root;
  const data = asRecord(body.data) ?? body;

  return {
    desktopDevices: toDevices(data.desktop_devices),
    mobileDevices: toDevices(data.mobile_devices),
    tvDevices: toDevices(data.tv_devices),
  };
}

export function pickControllableDesktop(devices: UuDevice[], excludedDeviceId = ""): UuDevice | null {
  return (
    devices.find((device) => device.controllable && device.deviceId !== excludedDeviceId) ??
    devices.find((device) => device.controllable) ??
    null
  );
}

function toDevices(value: unknown): UuDevice[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeDevice(asRecord(item) ?? {}));
}

function normalizeDevice(raw: UnknownRecord): UuDevice {
  const deviceId = stringValue(raw.device_id) || stringValue(raw.deviceId) || stringValue(raw.id);
  const alias =
    stringValue(raw.alias) ||
    stringValue(raw.device_name) ||
    stringValue(raw.deviceName) ||
    stringValue(raw.name) ||
    deviceId ||
    "Unnamed device";

  return {
    deviceId,
    alias,
    controllable: booleanValue(raw.controllable),
    platform: numberValue(raw.platform),
    status: stringValue(raw.status),
    versionName: stringValue(raw.version_name) || stringValue(raw.versionName),
    supportWol: booleanValue(raw.support_wol ?? raw.supportWol),
    controlledSupport: booleanValue(raw.controlled_support ?? raw.controlledSupport),
    appFlag: raw.app_flag ?? raw.appFlag,
    participantsInfo: normalizeParticipants(raw.participants_info ?? raw.participantsInfo),
    raw,
  };
}

function normalizeParticipants(value: unknown): UuParticipantInfo[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeParticipant(asRecord(item) ?? {}));
}

function normalizeParticipant(raw: UnknownRecord): UuParticipantInfo {
  return {
    clientId: stringValue(raw.client_id) || stringValue(raw.clientId),
    deviceId: stringValue(raw.device_id) || stringValue(raw.deviceId),
    alias: stringValue(raw.alias) || stringValue(raw.device_name) || stringValue(raw.deviceName) || "未知控制端",
    platform: numberValue(raw.platform),
    joinType: numberValue(raw.user_join_type ?? raw.joinType),
    controlledSeconds: numberValue(raw.controlled_time ?? raw.controlledSeconds),
    appFlag: raw.app_flag ?? raw.appFlag,
  };
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
