import { describe, expect, it } from "vitest";

import {
  STREAMER_CAPTURE_CHANGE_TYPES,
  STREAMER_CURSOR_SHAPE_WIRE_FIELDS,
  STREAMER_ROM_MESSAGE_TYPES,
  STREAMER_ROM_MESSAGE_WIRE_FIELDS,
  STREAMER_SEND_TO_ROM_WIRE_FIELDS,
  STREAMER_SIMPLE_ACTION_WIRE_FIELDS,
  STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS,
  STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS,
} from "../src/streamer/internal/controlChannelSchema.js";
import { STREAMER_SIMPLE_ACTION_TYPES } from "../src/streamer/controlChannelProtocol.js";
import {
  encodeStreamerEchoRequestMessage,
  encodeStreamerEchoResponseMessage,
  encodeStreamerInputMessage,
  encodeStreamerTextMessage,
} from "../src/streamer/controlChannelEncode.js";
import { decodeStreamerControlMessage } from "../src/streamer/controlChannelDecode.js";

describe("streamer control channel", () => {
  it("captures SendToRom wire tags and encodes VINPUT control messages", () => {
    expect(STREAMER_SEND_TO_ROM_WIRE_FIELDS).toEqual({
      envelopeTag: 11,
      inputTypeTag: 1,
      inputMessageTag: 2,
      displayIdTag: 3,
    });
    expect(STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT).toBe(0);

    expect(
      Array.from(
        encodeStreamerInputMessage({
          sequence: 1,
          timestampMs: 2,
          displayId: 5,
          inputMessage: "abc",
        }),
      ),
    ).toEqual([0x08, 0x01, 0x10, 0x02, 0x5a, 0x07, 0x12, 0x03, 0x61, 0x62, 0x63, 0x18, 0x05]);
  });

  it("captures legacy RomMessage tags", () => {
    expect(STREAMER_ROM_MESSAGE_WIRE_FIELDS).toEqual({
      envelopeTag: 10,
      nameTag: 1,
      valueTag: 2,
      displayIdTag: 3,
      byteValueTag: 4,
    });
  });

  it("encodes text channel SendToRom messages with RomMsg_Text type", () => {
    expect(STREAMER_ROM_MESSAGE_TYPES.RomMsg_Text).toBe(1);
    expect(
      Array.from(
        encodeStreamerTextMessage({
          sequence: 1,
          timestampMs: 2,
          inputMessage: "hi",
        }),
      ),
    ).toEqual([0x08, 0x01, 0x10, 0x02, 0x5a, 0x06, 0x08, 0x01, 0x12, 0x02, 0x68, 0x69]);
  });

  it("encodes App SendEchoRequest simple action heartbeat messages", () => {
    expect(STREAMER_SIMPLE_ACTION_WIRE_FIELDS).toEqual({
      envelopeTag: 3,
      actionTag: 1,
      argsTag: 2,
      featureFlagTag: 4,
    });
    expect(STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST).toBe(0);
    expect(STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS).toEqual({
      useClipboard: 2,
      autoClipboard: 1,
      enableKeyMouse: 2,
      enableGamepad: 2,
      enableTouch: 2,
      enableIme: 2,
      enableDisplayControl: 3,
    });

    expect(
      Array.from(
        encodeStreamerEchoRequestMessage({
          sequence: 1,
          timestampMs: 2,
        }),
      ),
    ).toEqual([
      0x08, 0x01, 0x10, 0x02, 0x1a, 0x1b, 0x12, 0x09, 0x7b, 0x22, 0x73, 0x65, 0x71, 0x22, 0x3a, 0x31, 0x7d, 0x22, 0x0e,
      0x08, 0x02, 0x10, 0x01, 0x18, 0x02, 0x20, 0x02, 0x30, 0x02, 0x38, 0x02, 0x40, 0x03,
    ]);
  });

  it("encodes and decodes App simple-action echo messages", () => {
    const request = encodeStreamerEchoRequestMessage({
      sequence: 41,
      timestampMs: 4200,
    });
    expect(decodeStreamerControlMessage(request)).toEqual({
      sequence: 41,
      timestampMs: 4200,
      byteLength: request.byteLength,
      topLevelTags: [1, 2, 3],
      simpleAction: {
        action: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST,
        actionName: "ACTION_TYPE_ECHO_REQUEST",
        args: '{"seq":41}',
        seq: 41,
        featureFlags: STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS,
      },
    });

    expect(
      Array.from(
        encodeStreamerEchoResponseMessage({
          sequence: 7,
          timestampMs: 8,
          responseSequence: 99,
        }),
      ),
    ).toEqual([
      0x08, 0x07, 0x10, 0x08, 0x1a, 0x1e, 0x08, 0x01, 0x12, 0x0a, 0x7b, 0x22, 0x73, 0x65, 0x71, 0x22, 0x3a, 0x39, 0x39,
      0x7d, 0x22, 0x0e, 0x08, 0x02, 0x10, 0x01, 0x18, 0x02, 0x20, 0x02, 0x30, 0x02, 0x38, 0x02, 0x40, 0x03,
    ]);
    expect(
      decodeStreamerControlMessage(
        encodeStreamerEchoResponseMessage({
          sequence: 7,
          timestampMs: 8,
          responseSequence: 99,
        }),
      ).simpleAction,
    ).toEqual({
      action: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_RESPONSE,
      actionName: "ACTION_TYPE_ECHO_RESPONSE",
      args: '{"seq":99}',
      seq: 99,
      featureFlags: STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS,
    });
  });

  it("decodes App capture_change and SendToRom control envelopes", () => {
    const captureChange = new Uint8Array([
      0x08,
      0x01,
      0x10,
      0x02,
      0x42,
      0x0a,
      0x08,
      STREAMER_CAPTURE_CHANGE_TYPES.CT_DESKTOP,
      0x10,
      0x05,
      0x1a,
      0x04,
      0x6d,
      0x61,
      0x69,
      0x6e,
    ]);
    expect(decodeStreamerControlMessage(captureChange)).toEqual({
      sequence: 1,
      timestampMs: 2,
      byteLength: captureChange.byteLength,
      topLevelTags: [1, 2, 8],
      captureChange: {
        captureType: STREAMER_CAPTURE_CHANGE_TYPES.CT_DESKTOP,
        captureTypeName: "CT_DESKTOP",
        captureId: 5,
        desc: "main",
      },
    });

    expect(
      decodeStreamerControlMessage(
        encodeStreamerInputMessage({
          sequence: 3,
          timestampMs: 4,
          displayId: 6,
          inputMessage: '{"action":"mouse_press","button":1}',
        }),
      ).sendToRom,
    ).toEqual({
      inputType: STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT,
      inputTypeName: "RomMsg_VINPUT",
      inputMessage: '{"action":"mouse_press","button":1}',
      displayId: 6,
    });
  });

  it("decodes SystemStateChange cursor_shape with little-endian doubles and signed cursor_type", () => {
    expect(STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS).toEqual({
      envelopeTag: 15,
      cursorShapeTag: 2,
    });
    expect(STREAMER_CURSOR_SHAPE_WIRE_FIELDS).toEqual({
      posXTag: 1,
      posYTag: 2,
      widthTag: 3,
      heightTag: 4,
      byteValueTag: 5,
      cursorTypeTag: 6,
      coordinateXScaleTag: 7,
      coordinateYScaleTag: 8,
      screenIdTag: 9,
    });

    const cursorShape = [
      0x08, 0xc0, 0x02, 0x10, 0xf0, 0x01, 0x18, 0x10, 0x20, 0x18, 0x2a, 0x04, 0x01, 0x02, 0x03, 0x04, 0x30, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01, 0x39, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f, 0x41, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x3f, 0x48, 0x02,
    ];
    const systemStateChange = [0x12, cursorShape.length, ...cursorShape];
    const payload = new Uint8Array([
      0x08,
      0x07,
      0xf1,
      0x01,
      0x00,
      0x01,
      0x02,
      0x03,
      0x04,
      0x05,
      0x06,
      0x07,
      0x7a,
      systemStateChange.length,
      ...systemStateChange,
      0xfd,
      0x01,
      0x08,
      0x09,
      0x0a,
      0x0b,
      0x10,
      0x09,
    ]);

    expect(decodeStreamerControlMessage(payload)).toEqual({
      sequence: 7,
      timestampMs: 9,
      byteLength: payload.byteLength,
      topLevelTags: [1, 30, 15, 31, 2],
      systemStateChange: {
        cursorShape: {
          posX: 320,
          posY: 240,
          width: 16,
          height: 24,
          byteValue: new Uint8Array([1, 2, 3, 4]),
          cursorType: -1,
          coordinateXScale: 1.5,
          coordinateYScale: 0.75,
          screenId: 2,
        },
      },
    });
  });
});
