import { STREAMER_CLIPBOARD_DECODE_LIMITS, STREAMER_CLIPBOARD_FORMATS } from "./clipboardProtocol.js";
import { STREAMER_CLIPBOARD_RPC_WIRE_FIELDS } from "./internal/clipboardSchema.js";
import {
  decodeClipboardRequestId,
  decodeClipboardRpcEnvelope,
  encodeClipboardRpcEnvelope,
  readClipboardFields,
  readInt32,
  readSingleMessageField,
  readText,
  type ClipboardEnvelopeMetadata,
} from "./internal/clipboardWire.js";
import { pushStringField, pushVarintField } from "./internal/protobufWire.js";

interface EncodeClipboardTextChangeRequestInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  requestId: number | bigint;
  text: string;
  formatId?: number;
}

export interface DecodedStreamerClipboardTextChangeRequest extends ClipboardEnvelopeMetadata {
  type: "text-change-request";
  formatId: number;
  text: string;
}

export interface DecodedStreamerClipboardTextChangeResponse extends ClipboardEnvelopeMetadata {
  type: "text-change-response";
  result: number;
}

export type DecodedStreamerClipboardMessage =
  DecodedStreamerClipboardTextChangeRequest | DecodedStreamerClipboardTextChangeResponse;

export function encodeStreamerClipboardTextChangeRequest(input: EncodeClipboardTextChangeRequestInput): Uint8Array {
  const formatId = input.formatId ?? STREAMER_CLIPBOARD_FORMATS.text;
  if (!Number.isSafeInteger(formatId) || formatId < 0 || BigInt(formatId) > 0x7fffffffn) {
    throw new RangeError("formatId must be a non-negative int32");
  }
  const encodedText = new TextEncoder().encode(input.text);
  if (encodedText.byteLength > STREAMER_CLIPBOARD_DECODE_LIMITS.maxTextBytes) {
    throw new RangeError(`clipboard text exceeds ${STREAMER_CLIPBOARD_DECODE_LIMITS.maxTextBytes} encoded bytes`);
  }
  const body: number[] = [];
  if (formatId !== 0) pushVarintField(body, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.textChangeRequest.formatIdTag, formatId);
  if (input.text !== "")
    pushStringField(body, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.textChangeRequest.textTag, input.text);
  return encodeClipboardRpcEnvelope({
    ...input,
    rpcTag: STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcRequestTag,
    bodyTag: STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.request.textChangeRequestTag,
    body: new Uint8Array(body),
  });
}

export function decodeStreamerClipboardMessage(
  data: ArrayBuffer | ArrayBufferView,
): DecodedStreamerClipboardMessage | undefined {
  const envelope = decodeClipboardRpcEnvelope(data);
  if (!envelope) return undefined;
  const fields = readClipboardFields(envelope.rpcBytes);
  if (!fields) return undefined;
  const requestId = decodeClipboardRequestId(envelope.rpcBytes);
  if (requestId === undefined) return undefined;
  const metadata = { sequence: envelope.sequence, timestampMs: envelope.timestampMs, requestId };

  if (envelope.rpcTag === STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcRequestTag) {
    const body = readSingleMessageField(
      envelope.rpcBytes,
      fields,
      STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.request.textChangeRequestTag,
    );
    return body ? decodeTextChangeRequest(body, metadata) : undefined;
  }

  const body = readSingleMessageField(
    envelope.rpcBytes,
    fields,
    STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.response.textChangeResponseTag,
  );
  return body ? decodeTextChangeResponse(body, metadata) : undefined;
}

function decodeTextChangeRequest(
  bytes: Uint8Array,
  metadata: ClipboardEnvelopeMetadata,
): DecodedStreamerClipboardTextChangeRequest | undefined {
  const fields = readClipboardFields(bytes);
  if (!fields) return undefined;
  const formatId = readInt32(fields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.textChangeRequest.formatIdTag);
  const text = readText(bytes, fields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.textChangeRequest.textTag);
  return formatId === undefined || text === undefined
    ? undefined
    : { type: "text-change-request", ...metadata, formatId, text };
}

function decodeTextChangeResponse(
  bytes: Uint8Array,
  metadata: ClipboardEnvelopeMetadata,
): DecodedStreamerClipboardTextChangeResponse | undefined {
  const fields = readClipboardFields(bytes);
  if (!fields) return undefined;
  const result = readInt32(fields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.textChangeResponse.resultTag);
  return result === undefined ? undefined : { type: "text-change-response", ...metadata, result };
}
