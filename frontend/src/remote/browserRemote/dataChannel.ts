import type {
  DecodedStreamerControlMessage,
  DecodedStreamerCursorShape,
} from "@uurc/shared/streamer/controlChannelDecode";
import { dropUndefinedFields } from "./utils.js";

export function dataChannelPayloadByteLength(data: string | ArrayBufferView | ArrayBuffer): number {
  if (typeof data === "string") return new TextEncoder().encode(data).byteLength;
  return data.byteLength;
}

export function dataChannelPayloadBytes(data: unknown): Uint8Array | undefined {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return undefined;
}

export function summarizeDataChannelPayload(
  data: unknown,
  options: { includeHexPrefix?: boolean } = {},
): Record<string, unknown> {
  const bytes = dataChannelPayloadBytes(data);
  const includeHexPrefix = options.includeHexPrefix ?? true;
  if (typeof data === "string") return { payloadType: "string", charLength: data.length };
  if (data instanceof ArrayBuffer) {
    return {
      payloadType: "arraybuffer",
      byteLength: data.byteLength,
      hexPrefix: includeHexPrefix ? bytesToHexPrefix(bytes) : undefined,
    };
  }
  if (ArrayBuffer.isView(data)) {
    return {
      payloadType: data.constructor.name,
      byteLength: data.byteLength,
      hexPrefix: includeHexPrefix ? bytesToHexPrefix(bytes) : undefined,
    };
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return { payloadType: "blob", byteLength: data.size };
  }
  return { payloadType: typeof data };
}

export function summarizeInputMessage(inputMessage: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(inputMessage);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return dropUndefinedFields({
        action: record.action,
        button: record.button,
        key: record.key,
        abs_x: record.abs_x,
        abs_y: record.abs_y,
        absX: record.absX,
        absY: record.absY,
        delta_x: record.delta_x,
        delta_y: record.delta_y,
        deltaX: record.deltaX,
        deltaY: record.deltaY,
      });
    }
  } catch {
    // Input messages may also be plain strings such as TEXT_CONTROL or MuMu touch commands.
  }
  return {
    preview: inputMessage.length > 80 ? `${inputMessage.slice(0, 80)}...` : inputMessage,
    length: inputMessage.length,
  };
}

export function summarizeDecodedControlMessage(message: DecodedStreamerControlMessage): Record<string, unknown> {
  return dropUndefinedFields({
    sequence: message.sequence,
    timestampMs: message.timestampMs,
    topLevelTags: message.topLevelTags,
    simpleAction: message.simpleAction
      ? dropUndefinedFields({
          action: message.simpleAction.action,
          actionName: message.simpleAction.actionName,
          args: message.simpleAction.args,
          seq: message.simpleAction.seq,
          featureFlags: message.simpleAction.featureFlags,
        })
      : undefined,
    captureChange: message.captureChange,
    cursorShape: message.systemStateChange?.cursorShape
      ? summarizeCursorShape(message.systemStateChange.cursorShape)
      : undefined,
    sendToRom: message.sendToRom
      ? dropUndefinedFields({
          inputType: message.sendToRom.inputType,
          inputTypeName: message.sendToRom.inputTypeName,
          displayId: message.sendToRom.displayId,
          input: message.sendToRom.inputMessage ? summarizeInputMessage(message.sendToRom.inputMessage) : undefined,
        })
      : undefined,
  });
}

export function summarizeCursorShape(shape: DecodedStreamerCursorShape): Record<string, unknown> {
  return dropUndefinedFields({
    cursorType: shape.cursorType,
    width: shape.width,
    height: shape.height,
    hotspotX: shape.posX,
    hotspotY: shape.posY,
    coordinateXScale: shape.coordinateXScale,
    coordinateYScale: shape.coordinateYScale,
    screenId: shape.screenId,
    imageByteLength: shape.byteValue?.byteLength,
  });
}

function bytesToHexPrefix(bytes: Uint8Array | undefined): string | undefined {
  if (!bytes) return undefined;
  return Array.from(bytes.slice(0, 32))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}
