import type { RemoteAssistanceControlMode, RoomJoinResult } from "@uurc/shared/roomSession";
import type { RemoteControlBootstrap } from "@uurc/shared/remoteBootstrap";
import type { RemoteSignalGatewayStatus } from "@uurc/shared/signalGateway/model";

import type { RoomJoinContext } from "../app/remoteControlTypes.js";

export function summarizeRoomJoinUpstream(upstream: unknown) {
  const record = asRecord(upstream);
  const body = asRecord(record?.body);
  const data = asRecord(body?.data);
  return {
    status: numberValue(record?.status),
    statusText: stringValue(record?.statusText),
    headers: safeHeaderKeys(record?.headers),
    body: {
      code: numberValue(body?.code),
      msg: stringValue(body?.msg),
      dataKeys: Array.isArray(body?.dataKeys)
        ? body.dataKeys.filter((item): item is string => typeof item === "string")
        : data
          ? Object.keys(data)
          : undefined,
    },
  };
}

export function getRoomJoinFailureMessage(result: RoomJoinResult | null): string {
  if (!result || result.roomConfigSummary) return "";
  const upstreamCode = result.upstream.body.code;
  const upstreamStatus = result.upstream.status;
  const refused = (typeof upstreamCode === "number" && upstreamCode !== 0) || upstreamStatus >= 400;
  if (!refused) return "";
  const reason =
    result.upstream.body.msg?.trim() ||
    (typeof upstreamCode === "number" ? `code ${upstreamCode}` : `HTTP ${upstreamStatus}`);
  return `服务端拒绝加入房间：${reason}`;
}

export function formatRoomJoinContext(context: RemoteControlBootstrap["joinContext"]): string {
  if (!context) return "-";
  if (context.kind === "remote_assistance") {
    const mode = formatRemoteAssistanceMode(context.controlMode);
    return mode ? `远程协助 · ${mode}` : "远程协助";
  }
  return context.forceJoin ? "接管加入" : "普通加入";
}

export function formatRoomReleaseState(
  status: RemoteSignalGatewayStatus | null,
  activeRemoteSession: boolean,
  selectedDeviceOccupied: boolean,
  context?: RoomJoinContext | RemoteControlBootstrap["joinContext"] | null,
): string {
  if (status?.roomClear) {
    const code = status.roomClear.body.code;
    const action = context?.kind === "remote_assistance" ? "已取消协助" : "已释放房间";
    return code === undefined || code === 0 ? action : `释放返回 ${code}`;
  }
  if (status?.roomClearError) return "释放失败";
  if (activeRemoteSession) return "控制中";
  if (selectedDeviceOccupied) return "已有控制端";
  return "-";
}

export function formatRoomReleaseDetail(
  status: RemoteSignalGatewayStatus | null,
  context?: RoomJoinContext | RemoteControlBootstrap["joinContext"] | null,
): string {
  if (status?.roomClearError) return status.roomClearError;
  if (status?.roomClear) {
    const message = status.roomClear.body.msg ? ` · ${status.roomClear.body.msg}` : "";
    const endpoint =
      context?.kind === "remote_assistance"
        ? "/api/v2/room/share/cancel_remote_assist"
        : "/api/v1/room/clear/by_device";
    return `${endpoint}${message}`;
  }
  return context?.kind === "remote_assistance" ? "断开连接时取消本次远程协助" : "断开连接时释放 UU 房间占用";
}

export function formatRemoteAssistanceMode(mode: RemoteAssistanceControlMode | null | undefined): string {
  switch (mode) {
    case "by_password":
      return "验证码";
    case "by_confirmation":
      return "对方确认";
    case "password_confirmation":
      return "验证码或确认";
    default:
      return "";
  }
}

function safeHeaderKeys(value: unknown): string[] {
  const record = asRecord(value);
  return record ? Object.keys(record) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
