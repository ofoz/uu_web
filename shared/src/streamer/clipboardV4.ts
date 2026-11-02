import { STREAMER_CLIPBOARD_FORMATS, STREAMER_CLIPBOARD_RESULTS } from "./clipboardProtocol.js";
import {
  STREAMER_CLIPBOARD_RPC_WIRE_FIELDS,
  STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS,
} from "./internal/clipboardSchema.js";
import {
  assertClipboardInt32,
  assertClipboardPositiveInt32,
  decodeClipboardRequestId,
  decodeClipboardRpcEnvelope,
  encodeClipboardRpcEnvelope,
  readBytes,
  readClipboardFields,
  readInt32,
  readSingleMessageField,
  readText,
  type ClipboardEnvelopeMetadata,
} from "./internal/clipboardWire.js";
import { pushMessageField, pushStringField, pushVarintField } from "./internal/protobufWire.js";

interface FormatDataAskInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  requestId: number | bigint;
  blockKey: string;
  formatId?: number;
  formatName?: string;
}

interface DataBlockConfirmInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  requestId: number | bigint;
  blockKey: string;
  blockId: number;
  result?: number;
}

export interface DecodedStreamerClipboardFormatDataConfirm extends ClipboardEnvelopeMetadata {
  type: "format-data-confirm";
  blockKey: string;
  blockCount: number;
  result: number;
}

export interface DecodedStreamerClipboardDataBlockRequest extends ClipboardEnvelopeMetadata {
  type: "data-block-request";
  blockKey: string;
  blockId: number;
  data: Uint8Array;
}

export interface DecodedStreamerClipboardDataBlockConfirm extends ClipboardEnvelopeMetadata {
  type: "data-block-confirm";
  blockKey: string;
  blockId: number;
  result: number;
}

export type DecodedStreamerClipboardV4Message =
  | DecodedStreamerClipboardFormatDataConfirm
  | DecodedStreamerClipboardDataBlockRequest
  | DecodedStreamerClipboardDataBlockConfirm;

export function encodeStreamerClipboardFormatDataAskRequest(input: FormatDataAskInput): Uint8Array {
  const formatId = input.formatId ?? STREAMER_CLIPBOARD_FORMATS.unicodeText;
  assertClipboardInt32(formatId, "formatId");
  if (!input.blockKey) throw new RangeError("blockKey must not be empty");
  const body: number[] = [];
  if (formatId !== 0) pushVarintField(body, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataAsk.formatIdTag, formatId);
  pushStringField(body, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataAsk.blockKeyTag, input.blockKey);
  if (input.formatName)
    pushStringField(body, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataAsk.formatNameTag, input.formatName);
  return encodeV4Envelope(input, true, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipRequest.formatDataAskTag, body);
}

export function encodeStreamerClipboardDataBlockConfirmResponse(input: DataBlockConfirmInput): Uint8Array {
  assertClipboardPositiveInt32(input.blockId, "blockId");
  const result = input.result ?? STREAMER_CLIPBOARD_RESULTS.succeeded;
  assertClipboardInt32(result, "result");
  if (!input.blockKey) throw new RangeError("blockKey must not be empty");
  const body: number[] = [];
  pushStringField(body, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.blockKeyTag, input.blockKey);
  pushVarintField(body, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.blockIdTag, input.blockId);
  if (result !== 0) pushVarintField(body, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.resultTag, result);
  return encodeV4Envelope(input, false, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipResponse.dataBlockConfirmTag, body);
}

export function decodeStreamerClipboardV4Message(
  data: ArrayBuffer | ArrayBufferView,
): DecodedStreamerClipboardV4Message | undefined {
  const envelope = decodeClipboardRpcEnvelope(data);
  if (!envelope) return undefined;
  const rpcFields = readClipboardFields(envelope.rpcBytes);
  const requestId = decodeClipboardRequestId(envelope.rpcBytes);
  if (!rpcFields || requestId === undefined) return undefined;
  const request = envelope.rpcTag === STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcRequestTag;
  const clipTag = request
    ? STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.request.clipRequestTag
    : STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.response.clipResponseTag;
  const clipBytes = readSingleMessageField(envelope.rpcBytes, rpcFields, clipTag);
  if (!clipBytes) return undefined;
  const metadata = { sequence: envelope.sequence, timestampMs: envelope.timestampMs, requestId };
  return request ? decodeV4Request(clipBytes, metadata) : decodeV4Response(clipBytes, metadata);
}

function encodeV4Envelope(
  input: FormatDataAskInput | DataBlockConfirmInput,
  request: boolean,
  bodyTag: number,
  body: number[],
): Uint8Array {
  const clipboard: number[] = [];
  pushMessageField(clipboard, bodyTag, new Uint8Array(body));
  return encodeClipboardRpcEnvelope({
    ...input,
    rpcTag: request
      ? STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcRequestTag
      : STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcResponseTag,
    bodyTag: request
      ? STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.request.clipRequestTag
      : STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.response.clipResponseTag,
    body: new Uint8Array(clipboard),
  });
}

function decodeV4Request(
  bytes: Uint8Array,
  metadata: ClipboardEnvelopeMetadata,
): DecodedStreamerClipboardDataBlockRequest | undefined {
  const fields = readClipboardFields(bytes);
  if (!fields) return undefined;
  const body = readSingleMessageField(bytes, fields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipRequest.dataBlockTag);
  if (!body) return undefined;
  const bodyFields = readClipboardFields(body);
  if (!bodyFields) return undefined;
  const blockKey = readText(body, bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlock.blockKeyTag);
  const blockId = readInt32(bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlock.blockIdTag);
  const data = readBytes(body, bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlock.dataTag);
  return !blockKey || blockId === undefined || !data
    ? undefined
    : { type: "data-block-request", ...metadata, blockKey, blockId, data };
}

function decodeV4Response(
  bytes: Uint8Array,
  metadata: ClipboardEnvelopeMetadata,
): DecodedStreamerClipboardFormatDataConfirm | DecodedStreamerClipboardDataBlockConfirm | undefined {
  const fields = readClipboardFields(bytes);
  if (!fields) return undefined;
  const supported = fields.filter(
    (field) =>
      field.tag === STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipResponse.formatDataConfirmTag ||
      field.tag === STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipResponse.dataBlockConfirmTag,
  );
  if (supported.length !== 1) return undefined;
  const body = readSingleMessageField(bytes, fields, supported[0].tag);
  if (!body) return undefined;
  const bodyFields = readClipboardFields(body);
  if (!bodyFields) return undefined;
  if (supported[0].tag === STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.clipResponse.formatDataConfirmTag) {
    const blockKey = readText(body, bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataConfirm.blockKeyTag);
    const result = readInt32(bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataConfirm.resultTag);
    const blockCount = readInt32(bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.formatDataConfirm.blockCountTag);
    return !blockKey || result === undefined || blockCount === undefined
      ? undefined
      : { type: "format-data-confirm", ...metadata, result, blockKey, blockCount };
  }
  const blockKey = readText(body, bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.blockKeyTag);
  const result = readInt32(bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.resultTag);
  const blockId = readInt32(bodyFields, STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS.dataBlockConfirm.blockIdTag);
  return !blockKey || result === undefined || blockId === undefined
    ? undefined
    : { type: "data-block-confirm", ...metadata, result, blockKey, blockId };
}
