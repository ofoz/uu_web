import { describe, expect, it, vi } from "vitest";

import { diagnoseVideoFlow } from "../src/remote/browserRemote/diagnostics.js";
import { BrowserRemoteSession } from "../src/remote/browserRemoteSession.js";
import type {
  BrowserRemoteInboundVideoStats,
  BrowserRemoteVideoElementSample,
} from "../src/remote/browserRemoteSessionTypes.js";
import { FakePeerConnection, FakeRemoteApi, makeInboundVideoStats } from "./browserRemoteSessionTestHarness.js";

describe("BrowserRemoteSession", () => {
  it("keeps the previous session debug tail for reconnect diagnostics", () => {
    const session = new BrowserRemoteSession({
      api: new FakeRemoteApi(),
      now: () => 2000,
      initialDebugEvents: [
        {
          id: 40,
          atMs: 1500,
          kind: "stats",
          summary: "画面停滞快照",
          details: { status: "decode_stalled" },
        },
      ],
    });

    expect(session.getState().debugEvents).toEqual([
      expect.objectContaining({
        id: 40,
        summary: "画面停滞快照",
      }),
      expect.objectContaining({
        id: 41,
        atMs: 2000,
        summary: "保留上一次会话调试日志",
        details: { eventCount: 1 },
      }),
    ]);
  });

  it("classifies the active WebRTC path from selected relay candidate stats", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "pair-1",
        {
          id: "pair-1",
          type: "candidate-pair",
          selected: true,
          state: "succeeded",
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
        },
      ],
      [
        "local-1",
        { id: "local-1", type: "local-candidate", candidateType: "relay", protocol: "udp", address: "203.0.113.10" },
      ],
      ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "relay", address: "203.0.113.11" }],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().connectionPath).toBe("relay");
    expect(session.getState().selectedCandidatePair).toMatchObject({
      localCandidateType: "relay",
      remoteCandidateType: "relay",
      protocol: "udp",
    });
  });

  it("classifies private host candidate pairs as LAN", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "pair-1",
        {
          id: "pair-1",
          type: "candidate-pair",
          nominated: true,
          state: "succeeded",
          localCandidateId: "local-1",
          remoteCandidateId: "remote-1",
        },
      ],
      ["local-1", { id: "local-1", type: "local-candidate", candidateType: "host", address: "192.168.1.20" }],
      ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "host", address: "192.168.1.30" }],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().connectionPath).toBe("lan");
    expect(session.getState().selectedCandidatePair).toMatchObject({
      localAddress: "192.168.1.20",
      remoteAddress: "192.168.1.30",
    });
  });

  it("records PeerConnection state transitions", async () => {
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api: new FakeRemoteApi(),
      createPeerConnection: () => peer,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    peer.connectionState = "disconnected";
    peer.iceConnectionState = "disconnected";
    peer.iceGatheringState = "complete";
    peer.onconnectionstatechange?.(new Event("connectionstatechange"));

    expect(session.getState()).toMatchObject({
      peerConnectionState: "disconnected",
      peerIceConnectionState: "disconnected",
      peerIceGatheringState: "complete",
    });
    expect(session.getState().debugEvents.at(-1)).toMatchObject({
      kind: "session",
      summary: "PeerConnection connectionState",
      details: {
        peerConnectionState: "disconnected",
        peerIceConnectionState: "disconnected",
        peerIceGatheringState: "complete",
      },
    });
  });

  it("records remote track mute and ended events", async () => {
    const peer = new FakePeerConnection();
    const onRemoteStream = vi.fn();
    const session = new BrowserRemoteSession({
      api: new FakeRemoteApi(),
      createPeerConnection: () => peer,
      onRemoteStream,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    const track = {
      id: "video-track-1",
      kind: "video",
      muted: false,
      readyState: "live",
      onmute: null,
      onunmute: null,
      onended: null,
    } as unknown as MediaStreamTrack;
    const tracks = [track];
    const stream = {
      addTrack: (nextTrack: MediaStreamTrack) => tracks.push(nextTrack),
      getTracks: () => [...tracks],
      removeTrack: (removedTrack: MediaStreamTrack) => {
        const index = tracks.indexOf(removedTrack);
        if (index >= 0) tracks.splice(index, 1);
      },
    } as unknown as MediaStream;
    vi.stubGlobal("MediaStream", undefined);
    try {
      peer.ontrack?.({
        track,
        streams: [stream],
        transceiver: { mid: "2" },
      } as unknown as RTCTrackEvent);
      Object.assign(track, { muted: true });
      track.onmute?.(new Event("mute"));
      Object.assign(track, { readyState: "ended" });
      track.onended?.(new Event("ended"));
    } finally {
      vi.unstubAllGlobals();
    }

    expect(session.getState().remoteTrackCount).toBe(0);
    expect(onRemoteStream).toHaveBeenCalledTimes(2);
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ summary: "远端 video 轨道 mute" }),
        expect.objectContaining({ summary: "远端 video 轨道 ended" }),
      ]),
    );
  });

  it("publishes inbound video RTP stats for freeze diagnostics", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "video-1",
        {
          id: "video-1",
          type: "inbound-rtp",
          kind: "video",
          packetsReceived: 120,
          bytesReceived: 98000,
          framesDecoded: 60,
          framesReceived: 66,
          framesDropped: 2,
          frameWidth: 2560,
          frameHeight: 1440,
          timestamp: 123456,
        },
      ],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().inboundVideo).toMatchObject({
      packetsReceived: 120,
      bytesReceived: 98000,
      framesDecoded: 60,
      framesReceived: 66,
      framesDropped: 2,
      frameWidth: 2560,
      frameHeight: 1440,
      timestampMs: 123456,
    });
  });

  it("matches inbound RTP stats to the video track shown by the primary element", async () => {
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api: new FakeRemoteApi(),
      createPeerConnection: () => peer,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    session.recordVideoElementSample({
      event: "playing",
      trackIdentifier: "live-track",
      currentTimeMs: 1000,
      presentedFrames: 60,
      readyState: 4,
      width: 1920,
      height: 1080,
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "video-old",
        {
          id: "video-old",
          type: "inbound-rtp",
          kind: "video",
          trackIdentifier: "old-track",
          framesDecoded: 500,
          packetsReceived: 1000,
        },
      ],
      [
        "video-live",
        {
          id: "video-live",
          type: "inbound-rtp",
          kind: "video",
          trackIdentifier: "live-track",
          mid: "1",
          ssrc: 4242,
          framesDecoded: 60,
          packetsReceived: 120,
        },
      ],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().inboundVideo).toMatchObject({
      id: "video-live",
      trackIdentifier: "live-track",
      mid: "1",
      ssrc: 4242,
      framesDecoded: 60,
    });
  });

  it("publishes the active inbound audio RTP and Opus codec stats", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    peer.stats = new Map<string, Record<string, unknown>>([
      [
        "audio-low",
        {
          id: "audio-low",
          type: "inbound-rtp",
          kind: "audio",
          bytesReceived: 100,
        },
      ],
      [
        "audio-active",
        {
          id: "audio-active",
          type: "inbound-rtp",
          mediaType: "audio",
          codecId: "opus-codec",
          packetsReceived: 240,
          packetsLost: 3,
          bytesReceived: 65536,
          jitter: 0.012,
          jitterBufferDelay: 1.2,
          jitterBufferEmittedCount: 120,
          totalSamplesReceived: 230400,
          concealedSamples: 960,
          silentConcealedSamples: 480,
          totalAudioEnergy: 8.5,
          audioLevel: 0.4,
          timestamp: 123456,
        },
      ],
      [
        "opus-codec",
        {
          id: "opus-codec",
          type: "codec",
          mimeType: "audio/opus",
          payloadType: 111,
          clockRate: 48000,
          channels: 2,
        },
      ],
    ]);

    await session.refreshConnectionStats();

    expect(session.getState().inboundAudio).toEqual({
      codecId: "opus-codec",
      codecMimeType: "audio/opus",
      codecPayloadType: 111,
      codecClockRate: 48000,
      codecChannels: 2,
      packetsReceived: 240,
      packetsLost: 3,
      bytesReceived: 65536,
      jitter: 0.012,
      jitterBufferDelay: 1.2,
      jitterBufferEmittedCount: 120,
      totalSamplesReceived: 230400,
      concealedSamples: 960,
      silentConcealedSamples: 480,
      totalAudioEnergy: 8.5,
      audioLevel: 0.4,
      timestampMs: 123456,
    });
    expect(session.getState().debugEvents.at(-1)).toMatchObject({
      kind: "stats",
      details: {
        inboundAudio: {
          codecMimeType: "audio/opus",
          bytesReceived: 65536,
        },
      },
    });
  });

  it("diagnoses a decode-side stall when RTP bytes advance but decoded frames do not", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    peer.stats = makeInboundVideoStats({ packetsReceived: 100, bytesReceived: 90000, framesDecoded: 50 });
    await session.refreshConnectionStats();
    peer.stats = makeInboundVideoStats({ packetsReceived: 130, bytesReceived: 125000, framesDecoded: 50 });
    await session.refreshConnectionStats();

    expect(session.getState().videoFlow).toMatchObject({
      status: "decode_stalled",
      title: "RTP 仍在收包，解码帧未增长",
      delta: {
        packetsReceived: 30,
        bytesReceived: 35000,
        framesDecoded: 0,
      },
    });
    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "stats",
          summary: "RTP 仍在收包，解码帧未增长",
        }),
      ]),
    );
    expect(session.getState().inboundVideo).toMatchObject({
      codecMimeType: "video/H264",
      decoderImplementation: "VideoToolbox",
    });
  });

  it("records pli/nack/keyDecoded deltas alongside decode_stalled stats", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    peer.stats = makeInboundVideoStats({
      packetsReceived: 100,
      bytesReceived: 90000,
      framesDecoded: 50,
      keyFramesDecoded: 1,
      pliCount: 0,
      nackCount: 0,
      framesDropped: 0,
    });
    await session.refreshConnectionStats();
    peer.stats = makeInboundVideoStats({
      packetsReceived: 130,
      bytesReceived: 125000,
      framesDecoded: 50,
      keyFramesDecoded: 1,
      pliCount: 3,
      nackCount: 7,
      framesDropped: 4,
    });
    await session.refreshConnectionStats();

    const flow = session.getState().videoFlow;
    expect(flow?.status).toBe("decode_stalled");
    expect(flow?.delta).toMatchObject({
      pliCount: 3,
      nackCount: 7,
      framesDropped: 4,
      keyFramesDecoded: 0,
    });
    expect(flow?.detail).toContain("pli +3");
    expect(flow?.detail).toContain("nack +7");
    expect(flow?.detail).toContain("dropped +4");
  });

  it("records the latest control input when video stalls and logs recovery duration", async () => {
    let nowMs = 1000;
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api: new FakeRemoteApi(),
      createPeerConnection: () => peer,
      now: () => nowMs,
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
      targetPlatform: 4,
    });

    session.sendKeyboardInput({ action: "keyboardPress", value: 66 });
    nowMs = 1500;
    peer.stats = makeInboundVideoStats({ packetsReceived: 100, bytesReceived: 90000, framesDecoded: 50 });
    await session.refreshConnectionStats();
    nowMs = 2200;
    peer.stats = makeInboundVideoStats({ packetsReceived: 130, bytesReceived: 125000, framesDecoded: 50 });
    await session.refreshConnectionStats();

    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          summary: "画面停滞快照",
          details: expect.objectContaining({
            status: "decode_stalled",
            lastControlInput: {
              atMs: 1000,
              ageMs: 1200,
              input: {
                action: "kbd_press",
                key: 36,
              },
            },
            peer: expect.objectContaining({
              peerConnectionState: "new",
              peerIceConnectionState: "new",
            }),
          }),
        }),
      ]),
    );

    nowMs = 3000;
    peer.stats = makeInboundVideoStats({ packetsReceived: 160, bytesReceived: 155000, framesDecoded: 80 });
    await session.refreshConnectionStats();

    expect(session.getState().debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          summary: "画面从停滞恢复",
          details: expect.objectContaining({
            previousStatus: "decode_stalled",
            stalledForMs: 800,
          }),
        }),
      ]),
    );
  });

  it("diagnoses a transport-side stall when neither RTP nor selected pair bytes advance", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    peer.stats = makeInboundVideoStats({ packetsReceived: 100, bytesReceived: 90000, framesDecoded: 50 });
    await session.refreshConnectionStats();
    peer.stats = makeInboundVideoStats({ packetsReceived: 100, bytesReceived: 90000, framesDecoded: 50 });
    await session.refreshConnectionStats();

    expect(session.getState().videoFlow).toMatchObject({
      status: "transport_stalled",
      title: "RTP 收包无增量",
      delta: {
        packetsReceived: 0,
        bytesReceived: 0,
        framesDecoded: 0,
      },
    });
  });

  it("diagnoses a presentation-side stall across consecutive stats samples", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.recordVideoElementSample({
      event: "sample",
      trackIdentifier: "video-track-1",
      currentTimeMs: 1000,
      presentedFrames: 50,
      totalVideoFrames: 50,
      readyState: 4,
      width: 1920,
      height: 1080,
    });
    peer.stats = makeInboundVideoStats({
      packetsReceived: 100,
      bytesReceived: 90000,
      framesReceived: 50,
      framesDecoded: 50,
    });
    await session.refreshConnectionStats();

    session.recordVideoElementSample({
      event: "sample",
      trackIdentifier: "video-track-1",
      currentTimeMs: 2000,
      presentedFrames: 50,
      totalVideoFrames: 50,
      readyState: 4,
      width: 1920,
      height: 1080,
    });
    peer.stats = makeInboundVideoStats({
      packetsReceived: 130,
      bytesReceived: 125000,
      framesReceived: 80,
      framesDecoded: 80,
    });
    await session.refreshConnectionStats();

    expect(session.getState().videoFlow).toMatchObject({
      status: "presentation_stalled",
      title: "浏览器已解码，Video 元素呈现帧未增长",
      delta: {
        framesDecoded: 30,
        presentedFrames: 0,
        videoElementFrames: 0,
      },
    });
  });

  it("records browser video element samples for playback diagnostics", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.recordVideoElementSample({
      event: "playing",
      currentTimeMs: 1200,
      totalVideoFrames: 72,
      droppedVideoFrames: 1,
      readyState: 4,
      paused: false,
      ended: false,
      width: 1920,
      height: 1080,
    });

    expect(session.getState().videoElement).toMatchObject({
      event: "playing",
      currentTimeMs: 1200,
      totalVideoFrames: 72,
      width: 1920,
      height: 1080,
    });
    expect(session.getState().debugEvents.at(-1)).toMatchObject({
      kind: "video_element",
      summary: "video playing",
    });
  });

  it("records audio autoplay failures and successful playback", async () => {
    const session = new BrowserRemoteSession({ api: new FakeRemoteApi() });

    session.recordAudioElementSample({
      event: "autoplay_blocked",
      currentTimeMs: 0,
      readyState: 1,
      paused: true,
      muted: false,
      volume: 1,
      autoplayBlocked: true,
      errorName: "NotAllowedError",
    });

    expect(session.getState().audioElement).toMatchObject({
      event: "autoplay_blocked",
      autoplayBlocked: true,
      errorName: "NotAllowedError",
    });
    expect(session.getState().debugEvents.at(-1)).toMatchObject({
      kind: "audio_element",
      summary: "audio autoplay_blocked",
    });

    session.recordAudioElementSample({
      event: "playing",
      currentTimeMs: 240,
      readyState: 4,
      paused: false,
      muted: false,
      volume: 1,
    });
    expect(session.getState().audioElement).toMatchObject({
      event: "playing",
      currentTimeMs: 240,
      paused: false,
    });
  });

  it("keeps the active video element sample when inactive transceivers report blank elements", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });
    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    session.recordVideoElementSample({
      event: "sample",
      currentTimeMs: 47,
      totalVideoFrames: 9,
      droppedVideoFrames: 4,
      readyState: 4,
      paused: false,
      ended: false,
      width: 2560,
      height: 1440,
    });
    session.recordVideoElementSample({
      event: "sample",
      currentTimeMs: 1047,
      totalVideoFrames: 62,
      droppedVideoFrames: 4,
      readyState: 4,
      paused: false,
      ended: false,
      width: 2560,
      height: 1440,
    });
    const flowAfterActiveSample = session.getState().videoFlow;
    const eventCountAfterActiveSample = session.getState().debugEvents.length;
    session.recordVideoElementSample({
      event: "sample",
      currentTimeMs: 0,
      totalVideoFrames: 0,
      droppedVideoFrames: 0,
      readyState: 0,
      paused: false,
      ended: false,
      width: 0,
      height: 0,
    });

    expect(session.getState().videoElement).toMatchObject({
      currentTimeMs: 1047,
      totalVideoFrames: 62,
      readyState: 4,
      width: 2560,
      height: 1440,
    });
    expect(session.getState().videoFlow).toEqual(flowAfterActiveSample);
    expect(session.getState().debugEvents).toHaveLength(eventCountAfterActiveSample);
  });
});

describe("diagnoseVideoFlow", () => {
  it("reports decode_stalled when received frames advance but decoded frames do not", () => {
    const diagnostics = diagnoseVideoDelta(
      {
        packetsReceived: 100,
        bytesReceived: 90000,
        framesReceived: 50,
        framesDecoded: 50,
      },
      {
        packetsReceived: 130,
        bytesReceived: 125000,
        framesReceived: 80,
        framesDecoded: 50,
      },
    );

    expect(diagnostics).toMatchObject({
      status: "decode_stalled",
      delta: {
        framesReceived: 30,
        framesDecoded: 0,
      },
    });
  });

  it("reports transport_stalled when only selected candidate pair bytes advance", () => {
    const diagnostics = diagnoseVideoFlow({
      nowMs: 2000,
      previous: {
        sampledAtMs: 1000,
        inboundVideo: {
          packetsReceived: 100,
          bytesReceived: 90000,
          framesReceived: 50,
          framesDecoded: 50,
        },
        selectedCandidatePair: {
          bytesReceived: 100000,
        },
      },
      current: {
        sampledAtMs: 2000,
        inboundVideo: {
          packetsReceived: 100,
          bytesReceived: 90000,
          framesReceived: 50,
          framesDecoded: 50,
        },
        selectedCandidatePair: {
          bytesReceived: 130000,
        },
      },
    });

    expect(diagnostics).toMatchObject({
      status: "transport_stalled",
      delta: {
        packetsReceived: 0,
        bytesReceived: 0,
        candidateBytesReceived: 30000,
      },
    });
  });

  it("uses received frames when decoded frame stats are unavailable", () => {
    const diagnostics = diagnoseVideoDelta(
      {
        packetsReceived: 100,
        bytesReceived: 90000,
        framesReceived: 50,
      },
      {
        packetsReceived: 130,
        bytesReceived: 125000,
        framesReceived: 80,
      },
    );

    expect(diagnostics).toMatchObject({
      status: "receiving",
      delta: {
        framesReceived: 30,
      },
    });
    expect(diagnostics.delta?.framesDecoded).toBeUndefined();
  });

  it("keeps receiving RTP when the browser exposes no frame counters", () => {
    const diagnostics = diagnoseVideoDelta(
      {
        packetsReceived: 100,
        bytesReceived: 90000,
      },
      {
        packetsReceived: 130,
        bytesReceived: 125000,
      },
    );

    expect(diagnostics).toMatchObject({
      status: "receiving",
      title: "视频 RTP 在增长",
      delta: {
        packetsReceived: 30,
        bytesReceived: 35000,
      },
    });
  });

  it("starts a new baseline when the selected inbound video track changes", () => {
    const diagnostics = diagnoseVideoDelta(
      {
        id: "inbound-old",
        trackIdentifier: "track-old",
        packetsReceived: 1000,
        bytesReceived: 900000,
        framesReceived: 500,
        framesDecoded: 500,
      },
      {
        id: "inbound-new",
        trackIdentifier: "track-new",
        packetsReceived: 10,
        bytesReceived: 9000,
        framesReceived: 5,
        framesDecoded: 5,
      },
    );

    expect(diagnostics).toMatchObject({
      status: "receiving",
      title: "视频 RTP 已开始采样",
    });
    expect(diagnostics.delta?.packetsReceived).toBeUndefined();
    expect(diagnostics.delta?.framesDecoded).toBeUndefined();
  });

  it("reports presentation_stalled when decoded frames advance and total video frames do not", () => {
    const diagnostics = diagnoseVideoDelta(
      {
        packetsReceived: 100,
        bytesReceived: 90000,
        framesReceived: 50,
        framesDecoded: 50,
      },
      {
        packetsReceived: 130,
        bytesReceived: 125000,
        framesReceived: 80,
        framesDecoded: 80,
      },
      {
        previousVideoElement: videoElementSample({ totalVideoFrames: 72 }),
        currentVideoElement: videoElementSample({ totalVideoFrames: 72 }),
      },
    );

    expect(diagnostics).toMatchObject({
      status: "presentation_stalled",
      title: "浏览器已解码，Video 元素呈现帧未增长",
      delta: {
        framesDecoded: 30,
        videoElementFrames: 0,
      },
    });
  });

  it("keeps receiving when decoded frames advance without comparable video element samples", () => {
    const diagnostics = diagnoseVideoDelta(
      {
        packetsReceived: 100,
        bytesReceived: 90000,
        framesReceived: 50,
        framesDecoded: 50,
      },
      {
        packetsReceived: 130,
        bytesReceived: 125000,
        framesReceived: 80,
        framesDecoded: 80,
      },
    );

    expect(diagnostics.status).toBe("receiving");
    expect(diagnostics.delta?.videoElementFrames).toBeUndefined();
  });

  it("does not treat the same video element sample reference as a presentation interval", () => {
    const sharedVideoElementSample = videoElementSample({ presentedFrames: 72, totalVideoFrames: 72 });
    const diagnostics = diagnoseVideoDelta(
      {
        packetsReceived: 100,
        bytesReceived: 90000,
        framesReceived: 50,
        framesDecoded: 50,
      },
      {
        packetsReceived: 130,
        bytesReceived: 125000,
        framesReceived: 80,
        framesDecoded: 80,
      },
      {
        previousVideoElement: sharedVideoElementSample,
        currentVideoElement: sharedVideoElementSample,
      },
    );

    expect(diagnostics.status).toBe("receiving");
    expect(diagnostics.delta?.videoElementFrames).toBeUndefined();
  });

  it("keeps receiving when decoded and total video frames advance together", () => {
    const diagnostics = diagnoseVideoDelta(
      {
        packetsReceived: 100,
        bytesReceived: 90000,
        framesReceived: 50,
        framesDecoded: 50,
      },
      {
        packetsReceived: 130,
        bytesReceived: 125000,
        framesReceived: 80,
        framesDecoded: 80,
      },
      {
        previousVideoElement: videoElementSample({ totalVideoFrames: 72 }),
        currentVideoElement: videoElementSample({ totalVideoFrames: 102 }),
      },
    );

    expect(diagnostics).toMatchObject({
      status: "receiving",
      delta: {
        framesDecoded: 30,
        videoElementFrames: 30,
      },
    });
  });

  it("prefers presented frame counters when both samples provide them", () => {
    const diagnostics = diagnoseVideoDelta(
      {
        packetsReceived: 100,
        bytesReceived: 90000,
        framesReceived: 50,
        framesDecoded: 50,
      },
      {
        packetsReceived: 130,
        bytesReceived: 125000,
        framesReceived: 80,
        framesDecoded: 80,
      },
      {
        previousVideoElement: videoElementSample({ presentedFrames: 50, totalVideoFrames: 72 }),
        currentVideoElement: videoElementSample({ presentedFrames: 50, totalVideoFrames: 102 }),
      },
    );

    expect(diagnostics).toMatchObject({
      status: "presentation_stalled",
      delta: {
        framesDecoded: 30,
        presentedFrames: 0,
        videoElementFrames: 0,
      },
    });
    expect(diagnostics.detail).toContain("presented +0");
  });

  it("does not compare different video element frame counters across samples", () => {
    const diagnostics = diagnoseVideoDelta(
      {
        packetsReceived: 100,
        bytesReceived: 90000,
        framesReceived: 50,
        framesDecoded: 50,
      },
      {
        packetsReceived: 130,
        bytesReceived: 125000,
        framesReceived: 80,
        framesDecoded: 80,
      },
      {
        previousVideoElement: videoElementSample({ presentedFrames: 72 }),
        currentVideoElement: videoElementSample({ totalVideoFrames: 72 }),
      },
    );

    expect(diagnostics.status).toBe("receiving");
    expect(diagnostics.delta?.videoElementFrames).toBeUndefined();
  });

  it("does not compare presentation counters from different video tracks", () => {
    const diagnostics = diagnoseVideoDelta(
      {
        packetsReceived: 100,
        bytesReceived: 90000,
        framesReceived: 50,
        framesDecoded: 50,
      },
      {
        packetsReceived: 130,
        bytesReceived: 125000,
        framesReceived: 80,
        framesDecoded: 80,
      },
      {
        previousVideoElement: videoElementSample({
          trackIdentifier: "video-track-1",
          presentedFrames: 72,
        }),
        currentVideoElement: videoElementSample({
          trackIdentifier: "video-track-2",
          presentedFrames: 72,
        }),
      },
    );

    expect(diagnostics.status).toBe("receiving");
    expect(diagnostics.delta?.videoElementFrames).toBeUndefined();
  });
});

function diagnoseVideoDelta(
  previousInboundVideo: BrowserRemoteInboundVideoStats,
  currentInboundVideo: BrowserRemoteInboundVideoStats,
  videoElements: {
    previousVideoElement?: BrowserRemoteVideoElementSample;
    currentVideoElement?: BrowserRemoteVideoElementSample;
  } = {},
) {
  return diagnoseVideoFlow({
    nowMs: 2000,
    previous: {
      sampledAtMs: 1000,
      inboundVideo: previousInboundVideo,
    },
    current: {
      sampledAtMs: 2000,
      inboundVideo: currentInboundVideo,
    },
    ...videoElements,
  });
}

function videoElementSample(
  frameCounters: Pick<BrowserRemoteVideoElementSample, "trackIdentifier" | "presentedFrames" | "totalVideoFrames">,
): BrowserRemoteVideoElementSample {
  return {
    event: "sample",
    currentTimeMs: 1000,
    ...frameCounters,
  };
}
