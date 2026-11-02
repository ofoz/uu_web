import { buildStreamerSoacPayload } from "../streamer/signalSoac.js";
import type { RemoteSignalControlRequest, RemoteSignalSoacRequest } from "./model.js";

export interface SignalGatewayBinaryCodec<TBinary> {
  decodeBase64(value: string | undefined): TBinary;
  toBinary(value: unknown): TBinary | null;
  byteLength(value: TBinary): number;
  encodeBase64(value: TBinary): string;
  gzipText(value: string): TBinary;
  gunzipText(value: unknown): string | null;
}

export interface AsyncSignalGatewayBinaryCodec<TBinary> extends Omit<
  SignalGatewayBinaryCodec<TBinary>,
  "gzipText" | "gunzipText"
> {
  gzipText(value: string): Promise<TBinary> | TBinary;
  gunzipText(value: unknown): Promise<string | null> | string | null;
}

export function buildSignalGatewayControlPayload<TBinary>(
  input: RemoteSignalControlRequest,
  binary: Pick<SignalGatewayBinaryCodec<TBinary>, "decodeBase64">,
): Record<string, unknown> {
  return {
    app_control_id: input.appControlId,
    app_data: binary.decodeBase64(input.appDataBase64),
    streamer_data: input.streamerData ?? "",
  };
}

export function buildSignalGatewaySoacPayload<TBinary>(
  input: RemoteSignalSoacRequest,
  binary: Pick<SignalGatewayBinaryCodec<TBinary>, "gzipText">,
): Record<string, unknown> {
  const prepared = prepareSignalGatewaySoacPayload(input);
  if (prepared.sdp === undefined) return prepared.payload;
  setCompressedSdp(prepared.payload, binary.gzipText(prepared.sdp));
  return prepared.payload;
}

export async function buildSignalGatewaySoacPayloadAsync<TBinary>(
  input: RemoteSignalSoacRequest,
  binary: Pick<AsyncSignalGatewayBinaryCodec<TBinary>, "gzipText">,
): Promise<Record<string, unknown>> {
  const prepared = prepareSignalGatewaySoacPayload(input);
  if (prepared.sdp === undefined) return prepared.payload;
  setCompressedSdp(prepared.payload, await binary.gzipText(prepared.sdp));
  return prepared.payload;
}

export function normalizeSignalGatewayPayload<TBinary>(
  value: unknown,
  binary: Pick<SignalGatewayBinaryCodec<TBinary>, "toBinary" | "byteLength" | "encodeBase64">,
): unknown {
  const bytes = binary.toBinary(value);
  if (bytes) {
    return {
      kind: "binary",
      byteLength: binary.byteLength(bytes),
      base64: binary.encodeBase64(bytes),
    };
  }
  if (Array.isArray(value)) return value.map((item) => normalizeSignalGatewayPayload(item, binary));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeSignalGatewayPayload(item, binary),
      ]),
    );
  }
  return value;
}

function prepareSignalGatewaySoacPayload(input: RemoteSignalSoacRequest): {
  payload: Record<string, unknown>;
  sdp?: string;
} {
  const payload = buildStreamerSoacPayload(input) as unknown as Record<string, unknown>;
  const shouldCompress =
    (input.type === "offer" || input.type === "answer" || input.type === "restart_ice") &&
    input.gzipSdp === true &&
    typeof input.sdp === "string";
  return shouldCompress ? { payload, sdp: input.sdp } : { payload };
}

function setCompressedSdp(payload: Record<string, unknown>, compressed: unknown): void {
  const data = payload.data as Record<string, unknown>;
  data.sdp = "";
  data.gzip_sdp = compressed;
}
