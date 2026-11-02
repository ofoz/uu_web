import { STREAMER_CLIPBOARD_DECODE_LIMITS } from "../clipboardProtocol.js";
import { STREAMER_CLIPBOARD_RPC_WIRE_FIELDS } from "./clipboardSchema.js";
import {
  protobufLengthDelimitedFieldBytes,
  protobufWireType,
  pushMessageField,
  pushVarintField,
  readProtobufFields,
  type ProtobufField,
} from "./protobufWire.js";

const MAX_SIGNED_INT64 = 0x7fffffffffffffffn;
const MAX_SIGNED_INT32 = 0x7fffffffn;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export interface ClipboardEnvelopeMetadata {
  sequence: bigint;
  timestampMs: bigint;
  requestId: bigint;
}

export interface ClipboardRpcEnvelope {
  sequence: bigint;
  timestampMs: bigint;
  rpcTag: number;
  rpcBytes: Uint8Array;
}

export function decodeClipboardRpcEnvelope(data: ArrayBuffer | ArrayBufferView): ClipboardRpcEnvelope | undefined {
  const bytes = toUint8Array(data);
  if (bytes.byteLength > STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes) return undefined;
  const fields = readClipboardFields(bytes);
  if (!fields) return undefined;
  const sequence = readInt64(fields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.sequenceTag);
  const timestampMs = readInt64(fields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.timestampMsTag);
  if (sequence === undefined || timestampMs === undefined) return undefined;
  const rpcFields = fields.filter(
    (field) =>
      field.tag === STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcRequestTag ||
      field.tag === STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.rpcResponseTag,
  );
  if (rpcFields.length !== 1) return undefined;
  const rpcBytes = protobufLengthDelimitedFieldBytes(bytes, rpcFields[0]);
  return rpcBytes ? { sequence, timestampMs, rpcTag: rpcFields[0].tag, rpcBytes } : undefined;
}

export function decodeClipboardRequestId(rpcBytes: Uint8Array): bigint | undefined {
  const fields = readClipboardFields(rpcBytes);
  if (!fields) return undefined;
  const header = readSingleMessageField(rpcBytes, fields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.request.headerTag);
  if (!header) return undefined;
  const headerFields = readClipboardFields(header);
  return headerFields ? readInt64(headerFields, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.header.requestIdTag) : undefined;
}

export function encodeClipboardRpcEnvelope(input: {
  sequence: number | bigint;
  timestampMs: number | bigint;
  requestId: number | bigint;
  rpcTag: number;
  bodyTag: number;
  body: Uint8Array;
}): Uint8Array {
  const sequence = checkedInt64(input.sequence, "sequence");
  const timestampMs = checkedInt64(input.timestampMs, "timestampMs");
  const requestId = checkedInt64(input.requestId, "requestId");
  const header: number[] = [];
  if (requestId !== 0n) pushVarintField(header, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.header.requestIdTag, requestId);
  const rpc: number[] = [];
  pushMessageField(rpc, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.request.headerTag, new Uint8Array(header));
  pushMessageField(rpc, input.bodyTag, input.body);
  const envelope: number[] = [];
  if (sequence !== 0n) pushVarintField(envelope, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.sequenceTag, sequence);
  if (timestampMs !== 0n)
    pushVarintField(envelope, STREAMER_CLIPBOARD_RPC_WIRE_FIELDS.envelope.timestampMsTag, timestampMs);
  pushMessageField(envelope, input.rpcTag, new Uint8Array(rpc));
  const encoded = new Uint8Array(envelope);
  if (encoded.byteLength > STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes) {
    throw new RangeError(`clipboard message exceeds ${STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes} bytes`);
  }
  return encoded;
}

export function readClipboardFields(bytes: Uint8Array): ProtobufField[] | undefined {
  return readProtobufFields(bytes, {
    maxFields: STREAMER_CLIPBOARD_DECODE_LIMITS.maxFieldsPerMessage,
    maxLengthDelimitedBytes: STREAMER_CLIPBOARD_DECODE_LIMITS.maxLengthDelimitedBytes,
    rejectMalformed: true,
  });
}

export function readSingleMessageField(
  bytes: Uint8Array,
  fields: readonly ProtobufField[],
  tag: number,
): Uint8Array | undefined {
  const matching = fields.filter((field) => field.tag === tag);
  return matching.length === 1 ? protobufLengthDelimitedFieldBytes(bytes, matching[0]) : undefined;
}

export function readInt64(fields: readonly ProtobufField[], tag: number): bigint | undefined {
  const matching = fields.filter((field) => field.tag === tag);
  if (matching.some((field) => field.wireType !== protobufWireType.varint || field.varint === undefined))
    return undefined;
  const value = matching.at(-1)?.varint ?? 0n;
  return value <= MAX_SIGNED_INT64 ? value : undefined;
}

export function readInt32(fields: readonly ProtobufField[], tag: number): number | undefined {
  const value = readInt64(fields, tag);
  return value !== undefined && value <= MAX_SIGNED_INT32 ? Number(value) : undefined;
}

export function readText(bytes: Uint8Array, fields: readonly ProtobufField[], tag: number): string | undefined {
  const encoded = readLengthDelimitedValue(bytes, fields, tag);
  if (encoded === undefined) return undefined;
  try {
    return textDecoder.decode(encoded);
  } catch {
    return undefined;
  }
}

export function readBytes(bytes: Uint8Array, fields: readonly ProtobufField[], tag: number): Uint8Array | undefined {
  return readLengthDelimitedValue(bytes, fields, tag);
}

export function assertClipboardInt32(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || BigInt(value) > MAX_SIGNED_INT32) {
    throw new RangeError(`${name} must be a non-negative int32`);
  }
}

export function assertClipboardPositiveInt32(value: number, name: string): void {
  assertClipboardInt32(value, name);
  if (value === 0) throw new RangeError(`${name} must be a positive int32`);
}

function readLengthDelimitedValue(
  bytes: Uint8Array,
  fields: readonly ProtobufField[],
  tag: number,
): Uint8Array | undefined {
  const matching = fields.filter((field) => field.tag === tag);
  if (matching.some((field) => field.wireType !== protobufWireType.lengthDelimited)) return undefined;
  const field = matching.at(-1);
  if (!field) return new Uint8Array();
  if (field.byteLength === undefined || field.byteLength > STREAMER_CLIPBOARD_DECODE_LIMITS.maxTextBytes)
    return undefined;
  return protobufLengthDelimitedFieldBytes(bytes, field);
}

function checkedInt64(value: number | bigint, name: string): bigint {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError(`${name} must be a non-negative safe integer or bigint`);
  }
  const normalized = BigInt(value);
  if (normalized < 0n || normalized > MAX_SIGNED_INT64)
    throw new RangeError(`${name} must fit in a non-negative int64`);
  return normalized;
}

function toUint8Array(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  return data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
