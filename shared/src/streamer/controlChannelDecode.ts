import { STREAMER_SIMPLE_ACTION_TYPES } from "./controlChannelProtocol.js";
import { STREAMER_CONTROL_DECODE_LIMITS } from "./internal/controlDecodeLimits.js";
import {
  STREAMER_CAPTURE_CHANGE_TYPES,
  STREAMER_CURSOR_SHAPE_WIRE_FIELDS,
  STREAMER_ROM_MESSAGE_TYPES,
  STREAMER_ROM_MESSAGE_WIRE_FIELDS,
  STREAMER_SEND_TO_ROM_WIRE_FIELDS,
  STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS,
  STREAMER_SIMPLE_ACTION_WIRE_FIELDS,
  STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS,
  type StreamerSimpleActionFeatureFlags,
} from "./internal/controlChannelSchema.js";
import {
  protobufFixed64FieldBytes,
  protobufLengthDelimitedFieldBytes,
  protobufWireType,
  readProtobufFields,
} from "./internal/protobufWire.js";
import { asRecord } from "./internal/unknown.js";

const textDecoder = new TextDecoder();

interface DecodedStreamerSimpleAction {
  action: number;
  actionName?: string;
  args?: string;
  seq?: number;
  featureFlags?: StreamerSimpleActionFeatureFlags;
}

interface DecodedStreamerCaptureChange {
  captureType: number;
  captureTypeName?: string;
  captureId?: number;
  desc?: string;
}

interface DecodedStreamerSendToRom {
  inputType: number;
  inputTypeName?: string;
  inputMessage?: string;
  displayId?: number;
}

interface DecodedStreamerRomMessage {
  name?: string;
  value?: string;
  displayId?: number;
  byteValueLength?: number;
}

export interface DecodedStreamerCursorShape {
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  byteValue?: Uint8Array;
  cursorType?: number;
  coordinateXScale?: number;
  coordinateYScale?: number;
  screenId?: number;
}

interface DecodedStreamerSystemStateChange {
  cursorShape?: DecodedStreamerCursorShape;
}

export interface DecodedStreamerControlMessage {
  sequence?: number;
  timestampMs?: number;
  byteLength: number;
  topLevelTags: number[];
  simpleAction?: DecodedStreamerSimpleAction;
  captureChange?: DecodedStreamerCaptureChange;
  romMessage?: DecodedStreamerRomMessage;
  sendToRom?: DecodedStreamerSendToRom;
  systemStateChange?: DecodedStreamerSystemStateChange;
}

export function decodeStreamerControlMessage(
  data: ArrayBuffer | ArrayBufferView,
): DecodedStreamerControlMessage | undefined {
  const bytes = toBytes(data);
  if (bytes.byteLength > STREAMER_CONTROL_DECODE_LIMITS.maxMessageBytes) return undefined;
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  const decoded: DecodedStreamerControlMessage = {
    byteLength: bytes.byteLength,
    topLevelTags: fields.map((field) => field.tag),
  };

  for (const field of fields) {
    if (field.tag === 1 && field.varint !== undefined) decoded.sequence = safeNumber(field.varint);
    if (field.tag === 2 && field.varint !== undefined) decoded.timestampMs = safeNumber(field.varint);
    const nested = protobufLengthDelimitedFieldBytes(bytes, field);
    if (!nested) continue;
    if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.envelopeTag) {
      decoded.simpleAction = decodeSimpleAction(nested);
    } else if (field.tag === 8) {
      decoded.captureChange = decodeCaptureChange(nested);
    } else if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.envelopeTag) {
      decoded.romMessage = decodeRomMessage(nested);
    } else if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.envelopeTag) {
      decoded.sendToRom = decodeSendToRom(nested);
    } else if (field.tag === STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.envelopeTag) {
      decoded.systemStateChange = decodeSystemStateChange(nested);
    }
  }
  return decoded;
}

function decodeSimpleAction(bytes: Uint8Array): DecodedStreamerSimpleAction | undefined {
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  let action: number = STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST;
  let args: string | undefined;
  let featureFlags: StreamerSimpleActionFeatureFlags | undefined;
  for (const field of fields) {
    if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.actionTag && field.varint !== undefined) {
      action = safeNumber(field.varint) ?? action;
    } else if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.argsTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) args = textDecoder.decode(value);
    } else if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.featureFlagTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) featureFlags = decodeFeatureFlags(value);
    }
  }
  return {
    action,
    actionName: simpleActionName(action),
    args,
    seq: args === undefined ? undefined : readActionSequence(args),
    featureFlags,
  };
}

function decodeFeatureFlags(bytes: Uint8Array): StreamerSimpleActionFeatureFlags | undefined {
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  const result: StreamerSimpleActionFeatureFlags = {};
  for (const field of fields) {
    if (field.varint === undefined) continue;
    const definition = STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS.find((item) => item.tag === field.tag);
    const value = safeNumber(field.varint);
    if (definition && value !== undefined) result[definition.name] = value;
  }
  return result;
}

function decodeCaptureChange(bytes: Uint8Array): DecodedStreamerCaptureChange | undefined {
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  let captureType: number = STREAMER_CAPTURE_CHANGE_TYPES.CT_DESKTOP;
  let captureId: number | undefined;
  let desc: string | undefined;
  for (const field of fields) {
    if (field.tag === 1 && field.varint !== undefined) captureType = safeNumber(field.varint) ?? captureType;
    if (field.tag === 2 && field.varint !== undefined) captureId = safeNumber(field.varint);
    if (field.tag === 3) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) desc = textDecoder.decode(value);
    }
  }
  return { captureType, captureTypeName: captureTypeName(captureType), captureId, desc };
}

function decodeSystemStateChange(bytes: Uint8Array): DecodedStreamerSystemStateChange | undefined {
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  const decoded: DecodedStreamerSystemStateChange = {};
  for (const field of fields) {
    if (field.tag !== STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.cursorShapeTag) continue;
    const value = protobufLengthDelimitedFieldBytes(bytes, field);
    if (value) decoded.cursorShape = decodeCursorShape(value);
  }
  return decoded;
}

function decodeCursorShape(bytes: Uint8Array): DecodedStreamerCursorShape | undefined {
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  const decoded: DecodedStreamerCursorShape = {};
  for (const field of fields) {
    if (field.varint !== undefined) assignCursorInt32(decoded, field.tag, field.varint);
    if (
      field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.byteValueTag &&
      field.byteLength !== undefined &&
      field.byteLength <= STREAMER_CONTROL_DECODE_LIMITS.maxCursorImageBytes
    ) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) decoded.byteValue = value.slice();
    }
    if (field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.coordinateXScaleTag) {
      const value = readDoubleField(bytes, field);
      if (value !== undefined) decoded.coordinateXScale = value;
    }
    if (field.tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.coordinateYScaleTag) {
      const value = readDoubleField(bytes, field);
      if (value !== undefined) decoded.coordinateYScale = value;
    }
  }
  return decoded;
}

function assignCursorInt32(decoded: DecodedStreamerCursorShape, tag: number, encoded: bigint): void {
  const value = decodeProtobufInt32(encoded);
  if (value === undefined) return;
  if (tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.posXTag) decoded.posX = value;
  if (tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.posYTag) decoded.posY = value;
  if (tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.widthTag) decoded.width = value;
  if (tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.heightTag) decoded.height = value;
  if (tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.cursorTypeTag) decoded.cursorType = value;
  if (tag === STREAMER_CURSOR_SHAPE_WIRE_FIELDS.screenIdTag) decoded.screenId = value;
}

function decodeSendToRom(bytes: Uint8Array): DecodedStreamerSendToRom | undefined {
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  let inputType: number = STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT;
  let inputMessage: string | undefined;
  let displayId: number | undefined;
  for (const field of fields) {
    if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputTypeTag && field.varint !== undefined) {
      inputType = safeNumber(field.varint) ?? inputType;
    } else if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputMessageTag) {
      const value = protobufLengthDelimitedFieldBytes(bytes, field);
      if (value) inputMessage = textDecoder.decode(value);
    } else if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.displayIdTag && field.varint !== undefined) {
      displayId = safeNumber(field.varint);
    }
  }
  return { inputType, inputTypeName: romMessageTypeName(inputType), inputMessage, displayId };
}

function decodeRomMessage(bytes: Uint8Array): DecodedStreamerRomMessage | undefined {
  const fields = readProtobufFields(bytes);
  if (!fields) return undefined;
  const decoded: DecodedStreamerRomMessage = {};
  for (const field of fields) {
    const value = protobufLengthDelimitedFieldBytes(bytes, field);
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.nameTag && value) decoded.name = textDecoder.decode(value);
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.valueTag && value) decoded.value = textDecoder.decode(value);
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.displayIdTag && field.varint !== undefined) {
      decoded.displayId = safeNumber(field.varint);
    }
    if (
      field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.byteValueTag &&
      field.wireType === protobufWireType.lengthDelimited &&
      field.byteLength !== undefined
    ) {
      decoded.byteValueLength = field.byteLength;
    }
  }
  return decoded;
}

function readActionSequence(args: string): number | undefined {
  try {
    const seq = asRecord(JSON.parse(args) as unknown)?.seq;
    if (typeof seq === "number" && Number.isSafeInteger(seq)) return seq;
    if (typeof seq === "string" && /^\d+$/.test(seq)) {
      const value = Number(seq);
      return Number.isSafeInteger(value) ? value : undefined;
    }
  } catch {
    const value = Number(args.match(/"seq"\s*:\s*(\d+)/)?.[1]);
    if (Number.isSafeInteger(value)) return value;
  }
  return undefined;
}

function safeNumber(value: bigint): number | undefined {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

function decodeProtobufInt32(value: bigint): number | undefined {
  return value >= 0n && value <= 0xffffffffffffffffn ? Number(BigInt.asIntN(32, value)) : undefined;
}

function readDoubleField(
  bytes: Uint8Array,
  field: Parameters<typeof protobufFixed64FieldBytes>[1],
): number | undefined {
  const encoded = protobufFixed64FieldBytes(bytes, field);
  if (!encoded) return undefined;
  const value = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength).getFloat64(0, true);
  return Number.isFinite(value) ? value : undefined;
}

function simpleActionName(action: number): string | undefined {
  if (action === STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST) return "ACTION_TYPE_ECHO_REQUEST";
  if (action === STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_RESPONSE) return "ACTION_TYPE_ECHO_RESPONSE";
  return undefined;
}

function captureTypeName(value: number): string | undefined {
  return Object.entries(STREAMER_CAPTURE_CHANGE_TYPES).find(([, candidate]) => candidate === value)?.[0];
}

function romMessageTypeName(value: number): string | undefined {
  return Object.entries(STREAMER_ROM_MESSAGE_TYPES).find(([, candidate]) => candidate === value)?.[0];
}

function toBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  return data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
