import type { StreamerRoomConfig } from "../roomConfig.js";
import { asRecord } from "../streamer/internal/unknown.js";
import { STREAMER_CONTROLLER_INBOUND_SOAC_TYPES, STREAMER_SOAC_EVENT } from "../streamer/signalSoac.js";
import { STREAMER_SIGNAL_SOCKET_EVENTS } from "../streamer/signalSession.js";
import type { AsyncSignalGatewayBinaryCodec, SignalGatewayBinaryCodec } from "./payload.js";

interface NormalizedEventDescriptor {
  event: string;
  payload: unknown;
}

export function normalizeSignalGatewayInboundEvents<TBinary>(
  event: string,
  payload: unknown[],
  binary: Pick<SignalGatewayBinaryCodec<TBinary>, "gunzipText">,
): NormalizedEventDescriptor[] {
  return describeInboundEvents(event, payload).map((descriptor) => ({
    event: descriptor.event,
    payload: normalizeInboundSoacData(descriptor.event, descriptor.payload, binary.gunzipText),
  }));
}

export async function normalizeSignalGatewayInboundEventsAsync<TBinary>(
  event: string,
  payload: unknown[],
  binary: Pick<AsyncSignalGatewayBinaryCodec<TBinary>, "gunzipText">,
): Promise<NormalizedEventDescriptor[]> {
  return Promise.all(
    describeInboundEvents(event, payload).map(async (descriptor) => ({
      event: descriptor.event,
      payload: await normalizeInboundSoacDataAsync(descriptor.event, descriptor.payload, binary.gunzipText),
    })),
  );
}

export function normalizeSignalGatewayRoomConfig(value: unknown): StreamerRoomConfig | null {
  const record = asRecord(value);
  if (!record || typeof record.token !== "string" || record.token.length === 0) return null;
  if (!Array.isArray(record.signalServers)) return null;
  const signalServers = record.signalServers.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  if (signalServers.length === 0) return null;
  return {
    token: record.token,
    signalServers,
    timeout: readOptionalNumber(record.timeout),
    signalReconnectDelay: readOptionalNumber(record.signalReconnectDelay),
    reportToken: readOptionalString(record.reportToken),
    reportUrl: readOptionalString(record.reportUrl),
    reportServerAddress: readOptionalString(record.reportServerAddress),
    appData: readOptionalString(record.appData),
  };
}

function describeInboundEvents(event: string, payload: unknown[]): NormalizedEventDescriptor[] {
  if (event !== STREAMER_SIGNAL_SOCKET_EVENTS.bmsgPush) {
    return isControllerInboundSoacType(event)
      ? [{ event: STREAMER_SOAC_EVENT, payload: payload.map((item) => addSoacType(event, item)) }]
      : [{ event, payload }];
  }

  const pushes = payload.map(parseSignalPush).filter((item) => item !== null);
  if (pushes.length === 0) return [{ event, payload }];
  return [
    { event, payload },
    ...pushes.map((push) => {
      const soac = isControllerInboundSoacType(push.type);
      return {
        event: soac ? STREAMER_SOAC_EVENT : push.type,
        payload: push.data === undefined ? [] : [soac ? addSoacType(push.type, push.data) : push.data],
      };
    }),
  ];
}

function normalizeInboundSoacData(
  event: string,
  payload: unknown,
  gunzipText: (value: unknown) => string | null,
): unknown {
  if (event !== STREAMER_SOAC_EVENT) return payload;
  if (Array.isArray(payload)) return payload.map((item) => normalizeSoacPayload(item, gunzipText));
  return normalizeSoacPayload(payload, gunzipText);
}

async function normalizeInboundSoacDataAsync(
  event: string,
  payload: unknown,
  gunzipText: (value: unknown) => Promise<string | null> | string | null,
): Promise<unknown> {
  if (event !== STREAMER_SOAC_EVENT) return payload;
  if (Array.isArray(payload)) return Promise.all(payload.map((item) => normalizeSoacPayloadAsync(item, gunzipText)));
  return normalizeSoacPayloadAsync(payload, gunzipText);
}

function normalizeSoacPayload(payload: unknown, gunzipText: (value: unknown) => string | null): unknown {
  const soacData = getSoacData(payload);
  if (!soacData || hasPlainSdp(soacData.data)) return payload;
  const plainSdp = gunzipText(soacData.data.gzip_sdp) ?? gunzipText(soacData.data.sdp);
  return plainSdp ? withPlainSdp(soacData, plainSdp) : payload;
}

async function normalizeSoacPayloadAsync(
  payload: unknown,
  gunzipText: (value: unknown) => Promise<string | null> | string | null,
): Promise<unknown> {
  const soacData = getSoacData(payload);
  if (!soacData || hasPlainSdp(soacData.data)) return payload;
  const plainSdp = (await gunzipText(soacData.data.gzip_sdp)) ?? (await gunzipText(soacData.data.sdp));
  return plainSdp ? withPlainSdp(soacData, plainSdp) : payload;
}

function getSoacData(payload: unknown): { record: Record<string, unknown>; data: Record<string, unknown> } | null {
  const record = asRecord(payload);
  const data = asRecord(record?.data);
  return record && data ? { record, data } : null;
}

function hasPlainSdp(data: Record<string, unknown>): boolean {
  return typeof data.sdp === "string" && data.sdp.length > 0;
}

function withPlainSdp(
  soacData: { record: Record<string, unknown>; data: Record<string, unknown> },
  sdp: string,
): unknown {
  return { ...soacData.record, data: { ...soacData.data, sdp } };
}

function parseSignalPush(value: unknown): { type: string; data?: unknown } | null {
  const parsed = parseJsonString(value) ?? parseWrappedSignalPush(value) ?? value;
  const record = asRecord(parsed);
  return record && typeof record.type === "string" && record.type.length > 0
    ? { type: record.type, data: record.data }
    : null;
}

function isControllerInboundSoacType(type: string): boolean {
  return STREAMER_CONTROLLER_INBOUND_SOAC_TYPES.includes(
    type as (typeof STREAMER_CONTROLLER_INBOUND_SOAC_TYPES)[number],
  );
}

function addSoacType(type: string, payload: unknown): unknown {
  const record = asRecord(payload);
  const data = asRecord(record?.data);
  if (!record || !data || typeof data.type === "string") return payload;
  return { ...record, data: { type, ...data } };
}

function parseWrappedSignalPush(value: unknown): unknown {
  const record = asRecord(value);
  return record ? parseJsonString(record._0 ?? record.onSignalPush) : null;
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
