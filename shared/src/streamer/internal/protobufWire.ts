import { STREAMER_CONTROL_DECODE_LIMITS } from "./controlDecodeLimits.js";

export const protobufWireType = {
  varint: 0,
  fixed64: 1,
  lengthDelimited: 2,
  fixed32: 5,
} as const;

const textEncoder = new TextEncoder();

function pushVarint(bytes: number[], value: number | bigint): void {
  let remaining = BigInt(value);
  if (remaining < 0n) {
    throw new RangeError("protobuf varint value must be non-negative");
  }

  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
}

function pushFieldKey(bytes: number[], fieldNumber: number, wireType: number): void {
  pushVarint(bytes, (fieldNumber << 3) | wireType);
}

export function pushInt32Field(bytes: number[], fieldNumber: number, value: number): void {
  pushFieldKey(bytes, fieldNumber, protobufWireType.varint);
  pushVarint(bytes, value < 0 ? BigInt.asUintN(64, BigInt(value)) : value);
}

export function pushStringField(bytes: number[], fieldNumber: number, value: string): void {
  const encoded = textEncoder.encode(value);
  pushFieldKey(bytes, fieldNumber, protobufWireType.lengthDelimited);
  pushVarint(bytes, encoded.length);
  for (const byte of encoded) bytes.push(byte);
}

export function pushVarintField(bytes: number[], fieldNumber: number, value: number | bigint): void {
  pushFieldKey(bytes, fieldNumber, protobufWireType.varint);
  pushVarint(bytes, value);
}

export function pushMessageField(bytes: number[], fieldNumber: number, payload: Uint8Array): void {
  pushFieldKey(bytes, fieldNumber, protobufWireType.lengthDelimited);
  pushVarint(bytes, payload.length);
  for (const byte of payload) bytes.push(byte);
}

export interface ProtobufField {
  tag: number;
  wireType: number;
  varint?: bigint;
  dataOffset?: number;
  byteLength?: number;
}

export interface ProtobufReadOptions {
  maxFields?: number;
  maxLengthDelimitedBytes?: number;
  rejectMalformed?: boolean;
}

export function readProtobufFields(bytes: Uint8Array, options: ProtobufReadOptions = {}): ProtobufField[] | undefined {
  const fields: ProtobufField[] = [];
  const maxFields = options.maxFields ?? STREAMER_CONTROL_DECODE_LIMITS.maxFieldsPerMessage;
  const maxLengthDelimitedBytes =
    options.maxLengthDelimitedBytes ?? STREAMER_CONTROL_DECODE_LIMITS.maxLengthDelimitedBytes;
  let offset = 0;

  while (offset < bytes.byteLength) {
    if (fields.length >= maxFields) return undefined;
    const key = readProtobufVarint(bytes, offset);
    if (!key) return malformed(fields, options);
    offset = key.nextOffset;
    const tag = Number(key.value >> 3n);
    const wireType = Number(key.value & 0x07n);
    if (!Number.isSafeInteger(tag) || tag <= 0 || tag > 0x1fffffff) return malformed(fields, options);

    if (wireType === protobufWireType.varint) {
      const value = readProtobufVarint(bytes, offset);
      if (!value) return malformed(fields, options);
      offset = value.nextOffset;
      fields.push({ tag, wireType, varint: value.value });
      continue;
    }

    if (wireType === protobufWireType.fixed64) {
      const nextOffset = offset + 8;
      if (nextOffset > bytes.byteLength) return malformed(fields, options);
      fields.push({ tag, wireType, dataOffset: offset, byteLength: 8 });
      offset = nextOffset;
      continue;
    }

    if (wireType === protobufWireType.lengthDelimited) {
      const length = readProtobufVarint(bytes, offset);
      if (!length) return malformed(fields, options);
      offset = length.nextOffset;
      const byteLength = Number(length.value);
      if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > bytes.byteLength - offset) {
        return malformed(fields, options);
      }
      if (byteLength > maxLengthDelimitedBytes) return undefined;
      fields.push({ tag, wireType, dataOffset: offset, byteLength });
      offset += byteLength;
      continue;
    }

    if (wireType === protobufWireType.fixed32) {
      const nextOffset = offset + 4;
      if (nextOffset > bytes.byteLength) return malformed(fields, options);
      fields.push({ tag, wireType, dataOffset: offset, byteLength: 4 });
      offset = nextOffset;
      continue;
    }

    return malformed(fields, options);
  }

  return fields;
}

function malformed(fields: ProtobufField[], options: ProtobufReadOptions): ProtobufField[] | undefined {
  return options.rejectMalformed ? undefined : fields;
}

export function protobufLengthDelimitedFieldBytes(bytes: Uint8Array, field: ProtobufField): Uint8Array | undefined {
  if (field.wireType !== protobufWireType.lengthDelimited) return undefined;
  if (field.dataOffset === undefined || field.byteLength === undefined) return undefined;
  return bytes.subarray(field.dataOffset, field.dataOffset + field.byteLength);
}

export function protobufFixed64FieldBytes(bytes: Uint8Array, field: ProtobufField): Uint8Array | undefined {
  if (field.wireType !== protobufWireType.fixed64 || field.byteLength !== 8) return undefined;
  if (field.dataOffset === undefined || field.byteLength === undefined) return undefined;
  return bytes.subarray(field.dataOffset, field.dataOffset + field.byteLength);
}

function readProtobufVarint(bytes: Uint8Array, startOffset: number): { value: bigint; nextOffset: number } | undefined {
  let value = 0n;
  let offset = startOffset;

  for (let index = 0; index < 10 && offset < bytes.byteLength; index += 1) {
    const byte = bytes[offset];
    if (index === 9 && byte > 1) return undefined;
    value |= BigInt(byte & 0x7f) << BigInt(index * 7);
    offset += 1;
    if ((byte & 0x80) === 0) return { value, nextOffset: offset };
  }

  return undefined;
}
