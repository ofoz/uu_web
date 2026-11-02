import { describe, expect, it } from "vitest";

import { decodeStreamerControlMessage } from "../src/streamer/controlChannelDecode.js";
import { STREAMER_CONTROL_DECODE_LIMITS } from "../src/streamer/internal/controlDecodeLimits.js";
import {
  STREAMER_CURSOR_SHAPE_WIRE_FIELDS,
  STREAMER_ROM_MESSAGE_WIRE_FIELDS,
  STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS,
} from "../src/streamer/internal/controlChannelSchema.js";

function encodeTestVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return new Uint8Array(bytes);
}

function concatTestBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function testVarintField(tag: number, value: number): Uint8Array {
  return concatTestBytes(encodeTestVarint(tag * 8), encodeTestVarint(value));
}

function testLengthDelimitedField(tag: number, payload: Uint8Array): Uint8Array {
  return concatTestBytes(encodeTestVarint(tag * 8 + 2), encodeTestVarint(payload.byteLength), payload);
}

function testFixed64Field(tag: number, payload: Uint8Array): Uint8Array {
  if (payload.byteLength !== 8) throw new RangeError("fixed64 test payload must contain 8 bytes");
  return concatTestBytes(encodeTestVarint(tag * 8 + 1), payload);
}

function wrapCursorShape(cursorShape: Uint8Array): Uint8Array {
  return testLengthDelimitedField(
    STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.envelopeTag,
    testLengthDelimitedField(STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.cursorShapeTag, cursorShape),
  );
}

describe("streamer control channel decode limits", () => {
  it("bounds control messages by total bytes without rejecting the exact limit", () => {
    const atLimit = new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxMessageBytes);
    atLimit.set(testVarintField(1, 7));

    expect(() => decodeStreamerControlMessage(atLimit)).not.toThrow();
    expect(decodeStreamerControlMessage(atLimit)).toEqual({
      sequence: 7,
      byteLength: STREAMER_CONTROL_DECODE_LIMITS.maxMessageBytes,
      topLevelTags: [1],
    });

    const overLimit = new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxMessageBytes + 1);
    overLimit.set(testVarintField(1, 7));
    expect(() => decodeStreamerControlMessage(overLimit)).not.toThrow();
    expect(decodeStreamerControlMessage(overLimit)).toBeUndefined();
  });

  it("bounds protobuf field counts independently at each message level", () => {
    const atLimit = concatTestBytes(
      ...Array.from({ length: STREAMER_CONTROL_DECODE_LIMITS.maxFieldsPerMessage }, () => testVarintField(20, 0)),
    );
    expect(decodeStreamerControlMessage(atLimit)?.topLevelTags).toHaveLength(
      STREAMER_CONTROL_DECODE_LIMITS.maxFieldsPerMessage,
    );

    const overLimit = concatTestBytes(atLimit, testVarintField(20, 0));
    expect(decodeStreamerControlMessage(overLimit)).toBeUndefined();

    const nestedCursorOverLimit = concatTestBytes(
      ...Array.from({ length: STREAMER_CONTROL_DECODE_LIMITS.maxFieldsPerMessage + 1 }, () => testVarintField(20, 0)),
    );
    const nestedPayload = concatTestBytes(testVarintField(1, 9), wrapCursorShape(nestedCursorOverLimit));
    expect(decodeStreamerControlMessage(nestedPayload)).toEqual({
      sequence: 9,
      byteLength: nestedPayload.byteLength,
      topLevelTags: [1, STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS.envelopeTag],
      systemStateChange: {},
    });
  });

  it("bounds length-delimited payloads while skipping accepted unknown fields", () => {
    const acceptedUnknownField = testLengthDelimitedField(
      20,
      new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxLengthDelimitedBytes),
    );
    const acceptedPayload = concatTestBytes(acceptedUnknownField, testVarintField(1, 42));
    expect(() => decodeStreamerControlMessage(acceptedPayload)).not.toThrow();
    expect(decodeStreamerControlMessage(acceptedPayload)).toEqual({
      sequence: 42,
      byteLength: acceptedPayload.byteLength,
      topLevelTags: [20, 1],
    });

    const rejectedPayload = testLengthDelimitedField(
      20,
      new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxLengthDelimitedBytes + 1),
    );
    expect(() => decodeStreamerControlMessage(rejectedPayload)).not.toThrow();
    expect(decodeStreamerControlMessage(rejectedPayload)).toBeUndefined();
  });

  it("keeps cursor metadata when an otherwise valid cursor image exceeds its dedicated limit", () => {
    const cursorMetadata = concatTestBytes(
      testVarintField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.cursorTypeTag, 0x7f01),
      testVarintField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.screenIdTag, 3),
    );
    const acceptedImage = new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxCursorImageBytes);
    const acceptedCursor = concatTestBytes(
      testLengthDelimitedField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.byteValueTag, acceptedImage),
      cursorMetadata,
    );
    const acceptedShape = decodeStreamerControlMessage(wrapCursorShape(acceptedCursor))?.systemStateChange?.cursorShape;
    expect(acceptedShape?.byteValue).toBeDefined();
    expect(acceptedShape?.byteValue).not.toBe(acceptedImage);
    expect(acceptedShape?.byteValue?.byteLength).toBe(STREAMER_CONTROL_DECODE_LIMITS.maxCursorImageBytes);
    expect(acceptedShape).toMatchObject({ cursorType: 0x7f01, screenId: 3 });

    const rejectedCursor = concatTestBytes(
      testLengthDelimitedField(
        STREAMER_CURSOR_SHAPE_WIRE_FIELDS.byteValueTag,
        new Uint8Array(STREAMER_CONTROL_DECODE_LIMITS.maxCursorImageBytes + 1),
      ),
      cursorMetadata,
    );
    expect(decodeStreamerControlMessage(wrapCursorShape(rejectedCursor))?.systemStateChange?.cursorShape).toEqual({
      cursorType: 0x7f01,
      screenId: 3,
    });
  });

  it("ignores known protobuf fields encoded with the wrong wire type", () => {
    const wrongScalePayload = wrapCursorShape(
      concatTestBytes(
        testLengthDelimitedField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.coordinateXScaleTag, new Uint8Array([0])),
        testVarintField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.screenIdTag, 5),
      ),
    );
    expect(() => decodeStreamerControlMessage(wrongScalePayload)).not.toThrow();
    expect(decodeStreamerControlMessage(wrongScalePayload)?.systemStateChange?.cursorShape).toEqual({ screenId: 5 });

    const wrongImagePayload = wrapCursorShape(
      concatTestBytes(
        testFixed64Field(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.byteValueTag, new Uint8Array(8).fill(1)),
        testVarintField(STREAMER_CURSOR_SHAPE_WIRE_FIELDS.cursorTypeTag, 0x7f01),
      ),
    );
    expect(decodeStreamerControlMessage(wrongImagePayload)?.systemStateChange?.cursorShape).toEqual({
      cursorType: 0x7f01,
    });

    const wrongRomByteValuePayload = testLengthDelimitedField(
      STREAMER_ROM_MESSAGE_WIRE_FIELDS.envelopeTag,
      concatTestBytes(
        testFixed64Field(STREAMER_ROM_MESSAGE_WIRE_FIELDS.byteValueTag, new Uint8Array(8)),
        testVarintField(STREAMER_ROM_MESSAGE_WIRE_FIELDS.displayIdTag, 2),
      ),
    );
    expect(decodeStreamerControlMessage(wrongRomByteValuePayload)?.romMessage).toEqual({ displayId: 2 });
  });

  it("keeps safely decoded protobuf fields when cursor data is malformed", () => {
    const partialCursor = [0x08, 0x2a, 0x10, 0x80];
    const partialSystemState = [0x12, partialCursor.length, ...partialCursor];
    const nestedMalformed = new Uint8Array([
      0x08,
      0x01,
      0x7a,
      partialSystemState.length,
      ...partialSystemState,
      0x10,
      0x02,
    ]);

    expect(() => decodeStreamerControlMessage(nestedMalformed)).not.toThrow();
    expect(decodeStreamerControlMessage(nestedMalformed)).toEqual({
      sequence: 1,
      timestampMs: 2,
      byteLength: nestedMalformed.byteLength,
      topLevelTags: [1, 15, 2],
      systemStateChange: { cursorShape: { posX: 42 } },
    });

    const truncatedFixed64 = new Uint8Array([0x08, 0x03, 0xf1, 0x01, 0x00, 0x01]);
    expect(() => decodeStreamerControlMessage(truncatedFixed64)).not.toThrow();
    expect(decodeStreamerControlMessage(truncatedFixed64)).toEqual({
      sequence: 3,
      byteLength: truncatedFixed64.byteLength,
      topLevelTags: [1],
    });

    const truncatedLengthDelimited = new Uint8Array([0x08, 0x04, 0x7a, 0x05, 0x12]);
    expect(() => decodeStreamerControlMessage(truncatedLengthDelimited)).not.toThrow();
    expect(decodeStreamerControlMessage(truncatedLengthDelimited)).toEqual({
      sequence: 4,
      byteLength: truncatedLengthDelimited.byteLength,
      topLevelTags: [1],
    });

    const unterminatedVarint = new Uint8Array([0x08, 0x05, 0x10, ...new Array<number>(10).fill(0x80)]);
    expect(() => decodeStreamerControlMessage(unterminatedVarint)).not.toThrow();
    expect(decodeStreamerControlMessage(unterminatedVarint)).toEqual({
      sequence: 5,
      byteLength: unterminatedVarint.byteLength,
      topLevelTags: [1],
    });

    const nonFiniteScaleCursor = [0x39, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x7f, 0x48, 0x03];
    const nonFiniteScaleState = [0x12, nonFiniteScaleCursor.length, ...nonFiniteScaleCursor];
    const nonFiniteScalePayload = new Uint8Array([0x7a, nonFiniteScaleState.length, ...nonFiniteScaleState]);
    expect(decodeStreamerControlMessage(nonFiniteScalePayload).systemStateChange).toEqual({
      cursorShape: { screenId: 3 },
    });
  });
});
