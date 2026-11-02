import type { UuDevice, UuDeviceGroups } from "@uurc/shared/devices";

export type DeviceCategory = "desktop" | "mobile" | "tv";

export interface CategorizedDevice {
  device: UuDevice;
  category: DeviceCategory;
  categoryLabel: string;
}

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  desktop: "桌面端",
  mobile: "移动端",
  tv: "TV",
};

// flattenDeviceGroups() 按 UU API 的三个字段分组返回，单个 UuDevice 上没有类别字段；
// 新版设备列表按在线/离线平铺展示、类别只作为行内说明文字，因此在合并时把类别信息一并打上标签。
export function categorizeDeviceGroups(groups: UuDeviceGroups): CategorizedDevice[] {
  return [
    ...groups.desktopDevices.map((device) => ({
      device,
      category: "desktop" as const,
      categoryLabel: CATEGORY_LABELS.desktop,
    })),
    ...groups.mobileDevices.map((device) => ({
      device,
      category: "mobile" as const,
      categoryLabel: CATEGORY_LABELS.mobile,
    })),
    ...groups.tvDevices.map((device) => ({ device, category: "tv" as const, categoryLabel: CATEGORY_LABELS.tv })),
  ];
}

// 把 UU 返回的英文/大写连接状态映射成中文；未知状态原样兜底。
const CONNECTION_STATUS_LABELS: Record<string, string> = {
  CONNECTED: "已连接",
  DISCONNECTED: "离线",
  ONLINE: "在线",
  OFFLINE: "离线",
  SLEEP: "休眠",
  STANDBY: "待机",
};

export function isDeviceOnline(device: UuDevice): boolean {
  return device.status ? device.status.toUpperCase() === "CONNECTED" : device.controllable;
}

export function getDeviceConnectionLabel(device: UuDevice): string {
  if (!device.status) return device.controllable ? "在线" : "离线";
  return CONNECTION_STATUS_LABELS[device.status.toUpperCase()] ?? device.status;
}

// 控制能力标签：仅在“在线但不可控/被占用”时才有额外信息；离线设备返回空串，
// 由调用方省略，避免和“离线”标签语义重叠（离线即不可控，无需再说一遍）。
export function getDeviceControlLabel(device: UuDevice): string {
  if ((device.participantsInfo?.length ?? 0) > 0) return "已有控制端";
  if (!isDeviceOnline(device)) return "";
  return device.controllable ? "可控制" : "不可控制";
}

export function formatAppFlagControlMode(appFlag: unknown): string {
  const record = asRecord(appFlag);
  if (!record) return "-";
  if (!("control_mode" in record) && !("controlMode" in record)) return "-";

  const rawMode = "control_mode" in record ? record.control_mode : record.controlMode;
  if (rawMode === null) return "普通桌面";
  if (rawMode === "second_screen") return "副屏";
  if (typeof rawMode === "string" && rawMode.length > 0) return rawMode;
  return "-";
}

export function formatParticipantMeta(participant: NonNullable<UuDevice["participantsInfo"]>[number]): string {
  const parts = [formatPlatform(participant.platform)];
  if (participant.joinType !== undefined)
    parts.push(participant.joinType === 1 ? "主控" : `类型 ${participant.joinType}`);
  if (participant.controlledSeconds !== undefined && participant.controlledSeconds >= 0)
    parts.push(formatDuration(participant.controlledSeconds));
  const controlMode = formatAppFlagControlMode(participant.appFlag);
  if (controlMode !== "-") parts.push(`模式：${controlMode}`);
  return parts.filter(Boolean).join(" · ") || "控制端";
}

function formatPlatform(platform: number | undefined): string {
  if (platform === undefined) return "";
  const labels: Record<number, string> = {
    1: "Windows",
    2: "Android",
    3: "iOS",
    4: "macOS",
    5: "TV",
  };
  return labels[platform] ?? `平台 ${platform}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
