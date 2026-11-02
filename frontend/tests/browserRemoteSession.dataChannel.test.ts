import { describe, expect, it, vi } from "vitest";

import type { DecodedStreamerCursorShape } from "@uurc/shared/streamer/controlChannelDecode";
import {
  encodeStreamerEchoRequestMessage,
  encodeStreamerEchoResponseMessage,
} from "@uurc/shared/streamer/controlChannelEncode";
import { STREAMER_DATA_CHANNEL_LABELS } from "@uurc/shared/streamer/transport";
import { BrowserRemoteSession } from "../src/remote/browserRemoteSession.js";
import { FakePeerConnection, FakeRemoteApi, cursorShapeControlMessage } from "./browserRemoteSessionTestHarness.js";

describe("BrowserRemoteSession", () => {
  it("records throttled inbound data channel messages for control debugging", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    let now = 5000;
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
    control?.emitMessage(new Uint8Array([1, 2, 3]).buffer);
    now = 6000;
    control?.emitMessage(new Uint8Array([4, 5]).buffer);
    now = 36000;
    control?.emitMessage("ok");

    const receiveEvents = session.getState().debugEvents.filter((event) => event.kind === "data_recv");
    expect(receiveEvents).toEqual([
      expect.objectContaining({
        summary: "收到 CONTROL_DATA_CHANNEL 数据",
        details: {
          label: STREAMER_DATA_CHANNEL_LABELS.control,
          payloadType: "arraybuffer",
          byteLength: 3,
          hexPrefix: "01 02 03",
          decoded: {
            topLevelTags: [],
          },
        },
      }),
      expect.objectContaining({
        summary: "收到 CONTROL_DATA_CHANNEL 数据",
        details: {
          label: STREAMER_DATA_CHANNEL_LABELS.control,
          payloadType: "string",
          charLength: 2,
        },
      }),
    ]);
  });

  it("publishes cursor shape changes without pushing session state", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const cursorShapes: Array<DecodedStreamerCursorShape | null> = [];
    const onStateChange = vi.fn();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => peer,
      onRemoteCursorShape: (shape) => cursorShapes.push(shape),
      onStateChange,
    });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const stateChangeCount = onStateChange.mock.calls.length;
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;

    control.emitMessage(cursorShapeControlMessage(5).buffer);

    expect(cursorShapes).toEqual([
      {
        posX: 2,
        posY: 3,
        width: 16,
        height: 24,
        byteValue: new Uint8Array([1, 2, 3, 4]),
        cursorType: 9,
        screenId: 5,
      },
    ]);
    expect(onStateChange).toHaveBeenCalledTimes(stateChangeCount);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          summary: "更新远端光标形状",
          details: expect.objectContaining({ imageByteLength: 4, screenId: 5 }),
        }),
      ]),
    );

    session.close();
    expect(cursorShapes.at(-1)).toBeNull();
    const cursorChangeCount = cursorShapes.length;
    control.emitMessage(cursorShapeControlMessage(5).buffer);
    expect(cursorShapes).toHaveLength(cursorChangeCount);
  });

  it("replies to App control EchoRequest messages without filling the diagnostic buffer", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    let now = 7000;
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
    const debugEventsBeforeHeartbeats = session.getState().debugEvents;
    now = 7100;
    for (let index = 0; index < 150; index += 1) {
      control?.emitMessage(
        encodeStreamerEchoRequestMessage({
          sequence: 41 + index,
          timestampMs: 7050,
        }).buffer,
      );
      control?.emitMessage(
        encodeStreamerEchoResponseMessage({
          sequence: 241 + index,
          timestampMs: 7050,
          responseSequence: 200 + index,
        }).buffer,
      );
    }

    expect(control?.sent).toHaveLength(150);
    expect(control?.sent.at(0)).toEqual(
      encodeStreamerEchoResponseMessage({
        sequence: 1,
        timestampMs: 7,
        responseSequence: 41,
      }),
    );
    expect(control?.sent.at(-1)).toEqual(
      encodeStreamerEchoResponseMessage({
        sequence: 150,
        timestampMs: 7,
        responseSequence: 190,
      }),
    );
    expect(session.getState().debugEvents).toEqual(debugEventsBeforeHeartbeats);
  });

  it("records an EchoResponse send failure", async () => {
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api: new FakeRemoteApi(),
      createPeerConnection: () => peer,
      now: () => 7100,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    control.failNextSendCount = 1;

    control.emitMessage(
      encodeStreamerEchoRequestMessage({
        sequence: 41,
        timestampMs: 7050,
      }).buffer,
    );

    expect(session.getState().debugEvents.at(-1)).toMatchObject({
      kind: "data_send",
      summary: "回复控制 EchoRequest 失败",
      details: {
        label: STREAMER_DATA_CHANNEL_LABELS.control,
        sequence: 1,
        responseSequence: 41,
        readyState: "open",
        error: "send failed",
      },
    });
  });

  it("closes peer and App data channels when the browser session is stopped", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const states: string[] = [];
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
      onStateChange: (state) => {
        states.push(state.stage);
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.close();

    expect(peer.closed).toBe(true);
    expect([...peer.channels.values()].every((channel) => channel.closed)).toBe(true);
    expect(session.getState()).toMatchObject({
      appControlId: "",
      connectionPath: "unknown",
      dataChannels: {},
      remoteTrackCount: 0,
      stage: "idle",
    });
    expect(states.at(-1)).toBe("idle");
  });
});
