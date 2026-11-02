import type { RemoteSignalGatewayEvent } from "@uurc/shared/signalGateway/model";
import type { StreamerIceNetworkType } from "@uurc/shared/streamer/signalSoac";
import { asRecord, dropUndefinedFields } from "./utils.js";

interface SwitchNetworkNotify {
  transportType?: StreamerIceNetworkType;
  iceId?: string;
}

export function summarizeSignalEvent(event: RemoteSignalGatewayEvent): Record<string, unknown> {
  return dropUndefinedFields({
    id: event.id,
    event: event.event,
    payload: summarizeSignalPayload(event.payload),
  });
}

export function extractRemoteDisplayId(payload: unknown): number | undefined {
  const payloads = Array.isArray(payload) ? payload : [payload];
  for (const item of payloads) {
    const record = asRecord(item);
    const data = asRecord(record?.data) ?? record;
    const capability = asRecord(data?.device_capability);
    const displayInfo = capability?.display_info;
    if (!Array.isArray(displayInfo)) continue;
    for (const display of displayInfo) {
      const displayRecord = asRecord(display);
      const id = displayRecord ? finiteNumber(displayRecord.id) : undefined;
      if (id !== undefined) return id;
    }
  }
  return undefined;
}

export function extractCandidateType(candidate: unknown): string | undefined {
  if (typeof candidate !== "string") return undefined;
  return candidate.match(/\btyp\s+([a-zA-Z0-9_-]+)/)?.[1];
}

export function normalizeCandidate(value: unknown): RTCIceCandidateInit | null {
  const record = asRecord(value);
  if (!record || typeof record.candidate !== "string" || record.candidate.length === 0) return null;
  const candidate: RTCIceCandidateInit = { candidate: record.candidate };
  if (typeof record.sdpMid === "string") candidate.sdpMid = record.sdpMid;
  if (typeof record.sdpMLineIndex === "number") candidate.sdpMLineIndex = record.sdpMLineIndex;
  return candidate;
}

export function normalizeSwitchNetworkNotify(
  payload: unknown,
  currentIceId: string | undefined,
): SwitchNetworkNotify | null {
  const payloads = Array.isArray(payload) ? payload : [payload];
  for (const item of payloads) {
    const record = asRecord(item);
    if (!record) continue;
    const iceId = typeof record.ice_id === "string" ? record.ice_id : undefined;
    if (iceId && currentIceId && iceId !== currentIceId) continue;
    const transportType =
      typeof record.transport_type === "number" ? (record.transport_type as StreamerIceNetworkType) : undefined;
    return { iceId, transportType };
  }
  return null;
}

export function matchesScopedString(value: string | undefined, currentValue: string | undefined): boolean {
  return value === undefined || currentValue === undefined || value === currentValue;
}

export function readStringField(record: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

export function createMediaStream(): MediaStream | null {
  return typeof MediaStream === "undefined" ? null : new MediaStream();
}

export function getBrowserH264CodecPreferences(): RTCRtpCodec[] {
  if (typeof RTCRtpSender === "undefined" || typeof RTCRtpSender.getCapabilities !== "function") return [];
  const codecs = RTCRtpSender.getCapabilities("video")?.codecs ?? [];
  const h264Codecs = codecs.filter((codec) => codec.mimeType.toLowerCase() === "video/h264");
  if (h264Codecs.length === 0) return [];
  const rtxCodecs = codecs.filter((codec) => codec.mimeType.toLowerCase() === "video/rtx");
  return [...h264Codecs, ...rtxCodecs];
}

export function applyVideoCodecPreferences(transceiver: RTCRtpTransceiver, codecs: RTCRtpCodec[]): void {
  if (codecs.length === 0 || typeof transceiver.setCodecPreferences !== "function") return;
  try {
    transceiver.setCodecPreferences(codecs);
  } catch {
    // Codec preferences are advisory; offer creation must remain usable when a browser rejects the filtered list.
  }
}

function summarizeSignalPayload(payload: unknown): unknown {
  const payloads = Array.isArray(payload) ? payload : [payload];
  return payloads.map((item) => {
    const record = asRecord(item);
    const data = asRecord(record?.data);
    if (!record && !data) return typeof item === "string" ? item.slice(0, 120) : item;
    return dropUndefinedFields({
      client_id: readStringField(record, "client_id", "clientId"),
      type: readStringField(data, "type"),
      app_control_id: readStringField(data, "app_control_id", "appControlId"),
      ice_id: readStringField(data, "ice_id", "iceId"),
      hasSdp: typeof data?.sdp === "string" && data.sdp.length > 0,
      hasGzipSdp: data?.gzip_sdp !== undefined,
      candidateType: extractCandidateType(asRecord(data?.candidate)?.candidate),
    });
  });
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
