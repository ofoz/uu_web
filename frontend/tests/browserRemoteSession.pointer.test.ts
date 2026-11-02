import { describe, expect, it, vi } from "vitest";

import {
  encodeStreamerEchoRequestMessage,
  encodeStreamerInputMessage,
} from "@uurc/shared/streamer/controlChannelEncode";
import {
  buildStreamerMouseButtonInputMessage,
  buildStreamerMouseMoveAbsoluteInputMessage,
  buildStreamerMouseScrollInputMessage,
} from "@uurc/shared/streamer/inputDesktop";
import { STREAMER_DATA_CHANNEL_LABELS, STREAMER_MAX_DATA_BUFFER_BYTES } from "@uurc/shared/streamer/transport";
import { BrowserRemoteSession } from "../src/remote/browserRemoteSession.js";
import { FakePeerConnection, FakeRemoteApi } from "./browserRemoteSessionTestHarness.js";

describe("BrowserRemoteSession", () => {
  it("sends desktop mouse input on the App control channel", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 2000,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.sendMouseClick({ absX: 320, absY: 240, button: "primary" });
    session.sendMouseScroll({ deltaX: 0, deltaY: -120 });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 2,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 320, absY: 240 }),
      }),
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mouseRelease", button: "primary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 4,
        timestampMs: 2,
        inputMessage: buildStreamerMouseScrollInputMessage({ deltaX: 0, deltaY: -120 }),
      }),
    ]);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "data_send",
          summary: "发送控制输入",
          details: expect.objectContaining({
            label: STREAMER_DATA_CHANNEL_LABELS.control,
            sequence: 4,
            input: {
              action: "mouse_scroll",
              delta_x: 0,
              delta_y: -120,
            },
          }),
        }),
      ]),
    );
    expect(
      session
        .getState()
        .debugEvents.some((event) => event.details?.input && event.details.input.action === "mouse_move_absolute"),
    ).toBe(false);
  });

  it("starts the App echo heartbeat on the control data channel and stops it when closed", async () => {
    vi.useFakeTimers();
    try {
      const api = new FakeRemoteApi();
      const peer = new FakePeerConnection();
      let now = 4100;
      const session = new BrowserRemoteSession({
        api,
        createPeerConnection: (configuration) => {
          peer.configuration = configuration;
          return peer;
        },
        now: () => now,
      });
      await session.start({
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: "{}",
      });

      const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control);
      control?.onopen?.(new Event("open"));
      const debugEventsAfterOpen = session.getState().debugEvents;

      expect(control?.sent).toEqual([
        encodeStreamerEchoRequestMessage({
          sequence: 1,
          timestampMs: 4,
        }),
      ]);

      now = 4200;
      vi.advanceTimersByTime(100);

      expect(control?.sent).toEqual([
        encodeStreamerEchoRequestMessage({
          sequence: 1,
          timestampMs: 4,
        }),
        encodeStreamerEchoRequestMessage({
          sequence: 2,
          timestampMs: 4,
        }),
      ]);
      expect(session.getState().debugEvents).toEqual(debugEventsAfterOpen);

      control?.close();
      now = 4500;
      vi.advanceTimersByTime(500);

      expect(control?.sent).toHaveLength(2);
      expect(session.getState().debugEvents.some((event) => event.summary === "发送控制心跳")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops only mouse-move frames while the control channel is backpressured", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => peer,
      now: () => 6000,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.bufferedAmount = STREAMER_MAX_DATA_BUFFER_BYTES;

    session.sendMouseMove({ absX: 120, absY: 80 });
    session.sendMouseButton({ action: "mousePress", button: "primary" });

    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 6,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
      }),
    ]);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ summary: "控制通道拥塞，跳过鼠标移动" })]),
    );
  });

  it("keeps only the latest backpressured move and sends it at the low watermark", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.bufferedAmount = STREAMER_MAX_DATA_BUFFER_BYTES;

    session.sendMouseMove({ absX: 120, absY: 80 });
    session.sendMouseMove({ absX: 520, absY: 340 });
    expect(control.sent).toEqual([]);

    control.bufferedAmount = control.bufferedAmountLowThreshold;
    control.emitBufferedAmountLow();
    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 520, absY: 340 }),
      }),
    ]);
  });

  it("sends a critical pointer position even while the control channel is backpressured", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.bufferedAmount = STREAMER_MAX_DATA_BUFFER_BYTES;

    session.sendMouseMove({ absX: 120, absY: 80 });
    session.sendMouseMove({ absX: 360, absY: 240 }, { critical: true });
    control.bufferedAmount = 0;
    control.emitBufferedAmountLow();

    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 360, absY: 240 }),
      }),
    ]);
  });

  it("retries a failed critical pointer position before sending a mouse button", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.failNextSendCount = 1;

    expect(() => session.sendMouseMove({ absX: 360, absY: 240 }, { critical: true })).toThrow("send failed");
    session.sendMouseButton({ action: "mousePress", button: "primary" });

    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 360, absY: 240 }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 6,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
      }),
    ]);
  });

  it("does not let a mouse button overtake a critical pointer position that still cannot be sent", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.failNextSendCount = 2;

    expect(() => session.sendMouseMove({ absX: 360, absY: 240 }, { critical: true })).toThrow("send failed");
    expect(() => session.sendMouseButton({ action: "mousePress", button: "primary" })).toThrow("send failed");
    expect(control.sent).toEqual([]);
  });

  it("flushes a failed critical position before the latest ordinary move at the low watermark", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.failNextSendCount = 1;

    expect(() => session.sendMouseMove({ absX: 120, absY: 80 }, { critical: true })).toThrow("send failed");
    control.bufferedAmount = STREAMER_MAX_DATA_BUFFER_BYTES;
    session.sendMouseMove({ absX: 520, absY: 340 });
    control.bufferedAmount = control.bufferedAmountLowThreshold;
    control.emitBufferedAmountLow();

    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 120, absY: 80 }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 520, absY: 340 }),
      }),
    ]);
  });

  it("does not let an ordinary move overtake a failed critical position", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer, now: () => 6000 });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.failNextSendCount = 1;

    expect(() => session.sendMouseMove({ absX: 120, absY: 80 }, { critical: true })).toThrow("send failed");
    session.sendMouseMove({ absX: 520, absY: 340 });
    control.emitBufferedAmountLow();

    expect(control.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 120, absY: 80 }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 6,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 520, absY: 340 }),
      }),
    ]);
  });

  it("does not retain a mouse press when its channel send fails", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({ api, createPeerConnection: () => peer });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.failNextSendCount = 1;

    expect(() => session.sendMouseButton({ action: "mousePress", button: "primary" })).toThrow("send failed");
    session.releaseAllInputs();

    expect(control.sent).toEqual([]);
  });

  it("sends pointer drag input as separate App mouse messages", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      now: () => 2500,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.sendMouseMove({ absX: 120, absY: 80 });
    session.sendMouseButton({ action: "mousePress", button: "primary" });
    session.sendMouseMove({ absX: 520, absY: 340 });
    session.sendMouseButton({ action: "mouseRelease", button: "primary" });

    expect(peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)?.sent).toEqual([
      encodeStreamerInputMessage({
        sequence: 1,
        timestampMs: 2,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 120, absY: 80 }),
      }),
      encodeStreamerInputMessage({
        sequence: 2,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" }),
      }),
      encodeStreamerInputMessage({
        sequence: 3,
        timestampMs: 2,
        inputMessage: buildStreamerMouseMoveAbsoluteInputMessage({ absX: 520, absY: 340 }),
      }),
      encodeStreamerInputMessage({
        sequence: 4,
        timestampMs: 2,
        inputMessage: buildStreamerMouseButtonInputMessage({ action: "mouseRelease", button: "primary" }),
      }),
    ]);
  });
});
