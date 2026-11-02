import { describe, expect, it } from "vitest";

import {
  STREAMER_CLIPBOARD_DECODE_LIMITS,
  STREAMER_CLIPBOARD_FORMAT_NAMES,
  STREAMER_CLIPBOARD_FORMATS,
  STREAMER_CLIPBOARD_RESULTS,
} from "../src/streamer/clipboardProtocol.js";
import {
  decodeStreamerClipboardMessage,
  encodeStreamerClipboardTextChangeRequest,
} from "../src/streamer/clipboardV3.js";
import {
  decodeStreamerClipboardV4Message,
  encodeStreamerClipboardDataBlockConfirmResponse,
  encodeStreamerClipboardFormatDataAskRequest,
} from "../src/streamer/clipboardV4.js";
import {
  STREAMER_CLIPBOARD_RPC_WIRE_FIELDS,
  STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS,
} from "../src/streamer/internal/clipboardSchema.js";

function decodeStreamerClipboardTextChangeRequest(data: Uint8Array) {
  const decoded = decodeStreamerClipboardMessage(data);
  return decoded?.type === "text-change-request" ? decoded : undefined;
}

function decodeStreamerClipboardTextChangeResponse(data: Uint8Array) {
  const decoded = decodeStreamerClipboardMessage(data);
  return decoded?.type === "text-change-response" ? decoded : undefined;
}

function decodeStreamerClipboardTextChangedNotification(data: Uint8Array) {
  const decoded = decodeStreamerClipboardTextChangeRequest(data);
  return decoded ? ({ ...decoded, type: "text-changed-notification" } as const) : undefined;
}

describe("streamer clipboard v3 RPC", () => {
  it("captures the Android v3 protobuf tags and enum values", () => {
    expect(STREAMER_CLIPBOARD_RPC_WIRE_FIELDS).toEqual({
      envelope: { sequenceTag: 1, timestampMsTag: 2, rpcRequestTag: 21, rpcResponseTag: 22 },
      request: { headerTag: 1, textChangeRequestTag: 10 },
      response: { headerTag: 1, textChangeResponseTag: 6 },
      header: { requestIdTag: 1 },
      textChangeRequest: { formatIdTag: 1, textTag: 2 },
      textChangeResponse: { resultTag: 1 },
    });
    expect(STREAMER_CLIPBOARD_FORMATS.text).toBe(1);
    expect(STREAMER_CLIPBOARD_RESULTS).toEqual({
      unspecified: 0,
      succeeded: 1,
      failed: 2,
    });
  });

  it("encodes the official ClipboardTextChangeReq envelope", () => {
    expect(
      Array.from(
        encodeStreamerClipboardTextChangeRequest({
          sequence: 1,
          timestampMs: 2,
          requestId: 3,
          text: "hi",
        }),
      ),
    ).toEqual([
      0x08, 0x01, 0x10, 0x02, 0xaa, 0x01, 0x0c, 0x0a, 0x02, 0x08, 0x03, 0x52, 0x06, 0x08, 0x01, 0x12, 0x02, 0x68, 0x69,
    ]);
  });

  it("decodes requests and the identical inbound changed-notification wire shape", () => {
    const encoded = encodeStreamerClipboardTextChangeRequest({
      sequence: 41n,
      timestampMs: 42n,
      requestId: 43n,
      text: "  first line\n第二行\n",
    });

    expect(decodeStreamerClipboardMessage(encoded)).toEqual({
      type: "text-change-request",
      sequence: 41n,
      timestampMs: 42n,
      requestId: 43n,
      formatId: STREAMER_CLIPBOARD_FORMATS.text,
      text: "  first line\n第二行\n",
    });
    expect(decodeStreamerClipboardTextChangeRequest(encoded)?.text).toBe("  first line\n第二行\n");
    expect(decodeStreamerClipboardTextChangedNotification(encoded)).toEqual({
      type: "text-changed-notification",
      sequence: 41n,
      timestampMs: 42n,
      requestId: 43n,
      formatId: STREAMER_CLIPBOARD_FORMATS.text,
      text: "  first line\n第二行\n",
    });
  });

  it("decodes ClipboardTextChangeResp success and failure fixtures", () => {
    const success = new Uint8Array([
      0x08,
      0x04,
      0x10,
      0x05,
      0xb2,
      0x01,
      0x08,
      0x0a,
      0x02,
      0x08,
      0x03,
      0x32,
      0x02,
      0x08,
      STREAMER_CLIPBOARD_RESULTS.succeeded,
    ]);
    expect(decodeStreamerClipboardTextChangeResponse(success)).toEqual({
      type: "text-change-response",
      sequence: 4n,
      timestampMs: 5n,
      requestId: 3n,
      result: STREAMER_CLIPBOARD_RESULTS.succeeded,
    });
    expect(decodeStreamerClipboardTextChangeRequest(success)).toBeUndefined();

    const failed = success.slice();
    failed[failed.byteLength - 1] = STREAMER_CLIPBOARD_RESULTS.failed;
    expect(decodeStreamerClipboardTextChangeResponse(failed)?.result).toBe(STREAMER_CLIPBOARD_RESULTS.failed);
  });

  it("preserves an empty value and whitespace-only clipboard content", () => {
    const empty = encodeStreamerClipboardTextChangeRequest({
      sequence: 0,
      timestampMs: 0,
      requestId: 0,
      text: "",
    });
    expect(decodeStreamerClipboardTextChangeRequest(empty)).toMatchObject({
      sequence: 0n,
      timestampMs: 0n,
      requestId: 0n,
      text: "",
    });

    const whitespace = encodeStreamerClipboardTextChangeRequest({
      sequence: 1,
      timestampMs: 2,
      requestId: 3,
      text: " \n\t ",
    });
    expect(decodeStreamerClipboardTextChangedNotification(whitespace)?.text).toBe(" \n\t ");
  });

  it("rejects malformed, ambiguous, oversized, and invalid UTF-8 payloads", () => {
    const valid = encodeStreamerClipboardTextChangeRequest({
      sequence: 1,
      timestampMs: 2,
      requestId: 3,
      text: "ok",
    });
    expect(decodeStreamerClipboardMessage(valid.subarray(0, valid.byteLength - 1))).toBeUndefined();
    expect(
      decodeStreamerClipboardMessage(new Uint8Array(STREAMER_CLIPBOARD_DECODE_LIMITS.maxMessageBytes + 1)),
    ).toBeUndefined();

    const rpcField = valid.subarray(4);
    const ambiguous = new Uint8Array(valid.byteLength + rpcField.byteLength);
    ambiguous.set(valid);
    ambiguous.set(rpcField, valid.byteLength);
    expect(decodeStreamerClipboardMessage(ambiguous)).toBeUndefined();

    const invalidUtf8 = new Uint8Array([
      0xaa, 0x01, 0x0a, 0x0a, 0x02, 0x08, 0x01, 0x52, 0x04, 0x08, 0x01, 0x12, 0x01, 0xff,
    ]);
    expect(decodeStreamerClipboardTextChangedNotification(invalidUtf8)).toBeUndefined();
  });

  it("enforces outbound request ID and encoded text limits", () => {
    expect(() =>
      encodeStreamerClipboardTextChangeRequest({ sequence: 1, timestampMs: 2, requestId: -1, text: "x" }),
    ).toThrow(RangeError);
    expect(() =>
      encodeStreamerClipboardTextChangeRequest({
        sequence: 1,
        timestampMs: 2,
        requestId: 3,
        text: "x".repeat(STREAMER_CLIPBOARD_DECODE_LIMITS.maxTextBytes + 1),
      }),
    ).toThrow(/clipboard text exceeds/);
  });
});

describe("streamer clipboard v4 RPC", () => {
  it("captures the native rich-clipboard tags and Unicode text format", () => {
    expect(STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS).toEqual({
      request: { clipRequestTag: 9 },
      response: { clipResponseTag: 5 },
      clipRequest: { formatDataAskTag: 2, dataBlockTag: 3 },
      clipResponse: { formatDataConfirmTag: 2, dataBlockConfirmTag: 3 },
      formatDataAsk: { formatIdTag: 1, blockKeyTag: 2, formatNameTag: 3 },
      formatDataConfirm: { resultTag: 1, blockKeyTag: 2, blockCountTag: 3 },
      dataBlock: { blockKeyTag: 1, blockIdTag: 2, dataTag: 3 },
      dataBlockConfirm: { blockKeyTag: 1, blockIdTag: 2, resultTag: 3 },
    });
    expect(STREAMER_CLIPBOARD_FORMATS.unicodeText).toBe(13);
    expect(STREAMER_CLIPBOARD_FORMAT_NAMES.macUtf8Text).toBe("public.utf8-plain-text");
  });

  it("encodes a native ClipboardFormatDataAsk request", () => {
    expect(
      Array.from(
        encodeStreamerClipboardFormatDataAskRequest({
          sequence: 7,
          timestampMs: 8,
          requestId: 4,
          blockKey: "k",
        }),
      ),
    ).toEqual([
      0x08, 0x07, 0x10, 0x08, 0xaa, 0x01, 0x0d, 0x0a, 0x02, 0x08, 0x04, 0x4a, 0x07, 0x12, 0x05, 0x08, 0x0d, 0x12, 0x01,
      0x6b,
    ]);
  });

  it("decodes a FILE channel ClipboardDataBlock and its TEXT confirmation", () => {
    const dataBlock = new Uint8Array([
      0x08, 0x09, 0x10, 0x0a, 0xaa, 0x01, 0x11, 0x0a, 0x02, 0x08, 0x05, 0x4a, 0x0b, 0x1a, 0x09, 0x0a, 0x01, 0x6b, 0x10,
      0x01, 0x1a, 0x02, 0x41, 0x00,
    ]);
    expect(decodeStreamerClipboardV4Message(dataBlock)).toEqual({
      type: "data-block-request",
      sequence: 9n,
      timestampMs: 10n,
      requestId: 5n,
      blockKey: "k",
      blockId: 1,
      data: new Uint8Array([0x41, 0x00]),
    });

    const formatDataConfirm = new Uint8Array([
      0x08, 0x0d, 0x10, 0x0e, 0xb2, 0x01, 0x0f, 0x0a, 0x02, 0x08, 0x06, 0x2a, 0x09, 0x12, 0x07, 0x08, 0x01, 0x12, 0x01,
      0x6b, 0x18, 0x01,
    ]);
    expect(decodeStreamerClipboardV4Message(formatDataConfirm)).toEqual({
      type: "format-data-confirm",
      sequence: 13n,
      timestampMs: 14n,
      requestId: 6n,
      result: STREAMER_CLIPBOARD_RESULTS.succeeded,
      blockKey: "k",
      blockCount: 1,
    });
  });

  it("encodes and decodes a ClipboardDataBlockConfirm response", () => {
    const encoded = encodeStreamerClipboardDataBlockConfirmResponse({
      sequence: 11,
      timestampMs: 12,
      requestId: 5,
      blockKey: "k",
      blockId: 1,
    });
    expect(Array.from(encoded)).toEqual([
      0x08, 0x0b, 0x10, 0x0c, 0xb2, 0x01, 0x0f, 0x0a, 0x02, 0x08, 0x05, 0x2a, 0x09, 0x1a, 0x07, 0x0a, 0x01, 0x6b, 0x10,
      0x01, 0x18, 0x01,
    ]);
    expect(decodeStreamerClipboardV4Message(encoded)).toEqual({
      type: "data-block-confirm",
      sequence: 11n,
      timestampMs: 12n,
      requestId: 5n,
      blockKey: "k",
      blockId: 1,
      result: STREAMER_CLIPBOARD_RESULTS.succeeded,
    });
  });

  it("rejects malformed blocks and invalid outbound identifiers", () => {
    expect(decodeStreamerClipboardV4Message(new Uint8Array([0xaa, 0x01, 0x01]))).toBeUndefined();
    expect(() =>
      encodeStreamerClipboardFormatDataAskRequest({
        sequence: 1,
        timestampMs: 2,
        requestId: 3,
        blockKey: "",
      }),
    ).toThrow(/blockKey/);
    expect(() =>
      encodeStreamerClipboardDataBlockConfirmResponse({
        sequence: 1,
        timestampMs: 2,
        requestId: 3,
        blockKey: "k",
        blockId: -1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      encodeStreamerClipboardDataBlockConfirmResponse({
        sequence: 1,
        timestampMs: 2,
        requestId: 3,
        blockKey: "k",
        blockId: 0,
      }),
    ).toThrow(RangeError);
  });
});
