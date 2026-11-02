import { asRecord, assignOptionalBoolean, assignOptionalNumber, assignOptionalString } from "./internal/unknown.js";
import { mapStreamerControlResultProtocolError } from "./internal/signalControlErrors.js";

export interface StreamerControlIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface StreamerRtcConfiguration {
  iceServers: StreamerControlIceServer[];
  iceTransportPolicy: "all" | "relay";
}

export interface StreamerControlPeerNetworkInfo {
  country?: string;
  province?: string;
  city?: string;
  isp?: string;
  relayIsp?: string;
}

export interface StreamerSignalControlResult {
  clientId?: string;
  iceId?: string;
  appControlId?: string;
  code?: number;
  msg?: string;
  appDataBase64?: string;
  streamerData?: string;
  controllerPlatform?: number;
  forceRelay?: boolean;
  autoSwitchNetwork?: boolean;
  relayInsType?: number;
  forceAutoSwitchPacketLoss?: number;
  forceAutoSwitchLatency?: number;
  possibleAutoSwitchPacketLoss?: number;
  possibleAutoSwitchLatency?: number;
  iceServers: StreamerControlIceServer[];
  publisher?: StreamerControlPeerNetworkInfo;
  subscriber?: StreamerControlPeerNetworkInfo;
}

export interface StreamerSignalControlAck {
  ackStatus?: string;
  result?: StreamerSignalControlResult;
}

export interface StreamerSignalControlFailure {
  ackStatus?: string;
  code?: number;
  msg?: string;
  protocolError?: string;
}

export function normalizeStreamerSignalControlAck(ack: unknown): StreamerSignalControlAck {
  const entries = Array.isArray(ack) ? ack : [ack];
  const ackStatus = typeof entries[0] === "string" ? entries[0] : undefined;
  const resultRecord = entries.map(asRecord).find((record) => record !== null);
  const result = resultRecord ? normalizeStreamerSignalControlResult(resultRecord) : undefined;
  return result ? { ackStatus, result } : { ackStatus };
}

export function getStreamerSignalControlFailure(ack: StreamerSignalControlAck): StreamerSignalControlFailure | null {
  const failedStatus = ack.ackStatus !== undefined && ack.ackStatus !== "success";
  const failedCode = ack.result?.code !== undefined && ack.result.code !== 0;
  if (!failedStatus && !failedCode) return null;

  return {
    ackStatus: ack.ackStatus,
    code: ack.result?.code,
    msg: ack.result?.msg,
    protocolError: ack.result?.code !== undefined ? mapStreamerControlResultProtocolError(ack.result.code) : undefined,
  };
}

export function formatStreamerSignalControlFailure(failure: StreamerSignalControlFailure): string {
  return [
    failure.ackStatus && failure.ackStatus !== "success" ? `ack=${failure.ackStatus}` : null,
    typeof failure.code === "number" ? `code=${failure.code}` : null,
    failure.protocolError ? `protocol=${failure.protocolError}` : null,
    failure.msg ? `msg=${failure.msg}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// [本地补丁] 补充双栈 STUN：UU 下发的 ICE 服务器若只覆盖 IPv4，
// 浏览器就拿不到 IPv6 的 srflx 候选，而 host 候选又被 mDNS 混淆，
// 对端无法直连，只能回落 TURN。追加双栈 STUN 可恢复 IPv6 直连能力。
const EXTRA_STUN_URLS = ["stun:stun.l.google.com:19302", "stun:stun.miwifi.com:3478"];

function isExtraStunEnabled(): boolean {
  try {
    if (typeof location === "undefined") return false;
    const flag = new URLSearchParams(location.search).get("stun");
    return flag !== "off" && flag !== "0" && flag !== "false";
  } catch {
    return false;
  }
}

function collectIceServerUrls(urls: string | string[]): string[] {
  return Array.isArray(urls) ? urls : [urls];
}

export function buildStreamerRtcConfiguration(
  result: StreamerSignalControlResult | null | undefined,
  options: { forceRelay?: boolean; appendStun?: boolean } = {},
): StreamerRtcConfiguration {
  const forceRelay = options.forceRelay ?? result?.forceRelay ?? false;
  const iceServers = result?.iceServers.map((iceServer) => ({ ...iceServer })) ?? [];
  const shouldAppendStun = !forceRelay && options.appendStun !== false && isExtraStunEnabled();
  if (shouldAppendStun) {
    const known = new Set(iceServers.flatMap((iceServer) => collectIceServerUrls(iceServer.urls)));
    for (const url of EXTRA_STUN_URLS) {
      if (!known.has(url)) iceServers.push({ urls: url });
    }
  }
  return { iceServers, iceTransportPolicy: forceRelay ? "relay" : "all" };
}

function normalizeStreamerSignalControlResult(record: Record<string, unknown>): StreamerSignalControlResult {
  const result: StreamerSignalControlResult = { iceServers: normalizeStreamerControlIceServers(record.iceServers) };
  assignOptionalString(result, "clientId", record.client_id);
  assignOptionalString(result, "iceId", record.ice_id);
  assignOptionalString(result, "appControlId", record.app_control_id);
  assignOptionalString(result, "msg", record.msg);
  assignOptionalString(result, "streamerData", record.streamer_data);
  assignOptionalNumber(result, "code", record.code);
  assignOptionalNumber(result, "controllerPlatform", record.controller_platform);
  assignOptionalString(result, "appDataBase64", normalizeStreamerBinaryBase64(record.app_data));
  assignOptionalBoolean(result, "forceRelay", record.force_relay);
  assignOptionalBoolean(result, "autoSwitchNetwork", record.auto_switch_network);
  assignOptionalNumber(result, "relayInsType", record.relay_ins_type);
  assignOptionalNumber(result, "forceAutoSwitchPacketLoss", record.force_auto_switch_pkt_loss);
  assignOptionalNumber(result, "forceAutoSwitchLatency", record.force_auto_switch_latency);
  assignOptionalNumber(result, "possibleAutoSwitchPacketLoss", record.possible_auto_switch_pkt_loss);
  assignOptionalNumber(result, "possibleAutoSwitchLatency", record.possible_auto_switch_latency);

  const publisher = normalizeStreamerPeerNetworkInfo(record, "publisher");
  if (publisher) result.publisher = publisher;
  const subscriber = normalizeStreamerPeerNetworkInfo(record, "subscriber");
  if (subscriber) result.subscriber = subscriber;
  return result;
}

function normalizeStreamerControlIceServers(value: unknown): StreamerControlIceServer[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeStreamerControlIceServer).filter((item) => item !== null);
}

function normalizeStreamerControlIceServer(value: unknown): StreamerControlIceServer | null {
  const record = asRecord(value);
  if (!record) return null;
  const urls = normalizeStreamerIceServerUrls(record.urls);
  if (!urls) return null;
  const iceServer: StreamerControlIceServer = { urls };
  assignOptionalString(iceServer, "username", record.username);
  assignOptionalString(iceServer, "credential", record.credential);
  return iceServer;
}

function normalizeStreamerIceServerUrls(value: unknown): string | string[] | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (!Array.isArray(value)) return null;
  const urls = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return urls.length > 0 ? urls : null;
}

function normalizeStreamerBinaryBase64(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  const record = asRecord(value);
  return record && typeof record.base64 === "string" && record.base64.length > 0 ? record.base64 : undefined;
}

function normalizeStreamerPeerNetworkInfo(
  record: Record<string, unknown>,
  prefix: "publisher" | "subscriber",
): StreamerControlPeerNetworkInfo | undefined {
  const info: StreamerControlPeerNetworkInfo = {};
  assignOptionalString(info, "country", record[`${prefix}_country`]);
  assignOptionalString(info, "province", record[`${prefix}_province`]);
  assignOptionalString(info, "city", record[`${prefix}_city`]);
  assignOptionalString(info, "isp", record[`${prefix}_isp`]);
  assignOptionalString(info, "relayIsp", record[`${prefix}_relay_isp`]);
  return Object.keys(info).length > 0 ? info : undefined;
}
