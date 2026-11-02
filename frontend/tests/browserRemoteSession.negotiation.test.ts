import { describe, expect, it, vi } from "vitest";

import type {
  RemoteSignalControlRequest,
  RemoteSignalControlResult,
  RemoteSignalSoacRequest,
  RemoteSignalSoacResult,
} from "@uurc/shared/signalGateway/model";
import { STREAMER_DATA_CHANNEL_LABELS } from "@uurc/shared/streamer/transport";
import { BrowserRemoteSession } from "../src/remote/browserRemoteSession.js";
import { FakePeerConnection, FakeRemoteApi, deferred, soacEvent } from "./browserRemoteSessionTestHarness.js";

describe("BrowserRemoteSession", () => {
  it("starts the app-compatible browser WebRTC offer flow from a signal control ack", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    const session = new BrowserRemoteSession({
      api,
      getVideoCodecPreferences: () => [
        {
          mimeType: "video/H264",
          clockRate: 90000,
          sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
        },
      ],
      createPeerConnection: (configuration) => {
        peer.configuration = configuration;
        return peer;
      },
    });

    await session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: '{"control_id":"control-1","device_capability":{}}',
    });

    expect(api.controlCalls).toEqual([
      {
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: '{"control_id":"control-1","device_capability":{}}',
      },
    ]);
    // 除服务商下发的 TURN 之外，本地还会追加两个公共 STUN（用于拿到双栈 srflx 候选）。
    expect(peer.configuration).toEqual({
      iceServers: [
        {
          urls: "turn:relay.example:3478?transport=udp",
          username: "turn-user",
          credential: "turn-pass",
        },
        {
          urls: "stun:stun.l.google.com:19302",
        },
        {
          urls: "stun:stun.miwifi.com:3478",
        },
      ],
      iceTransportPolicy: "all",
    });
    expect(peer.transceivers).toEqual([
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "video", direction: "recvonly" },
      { kind: "audio", direction: "recvonly" },
    ]);
    expect(peer.videoCodecPreferenceCalls).toHaveLength(5);
    expect(peer.videoCodecPreferenceCalls).toEqual(
      Array.from({ length: 5 }, () => [
        {
          mimeType: "video/H264",
          clockRate: 90000,
          sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
        },
      ]),
    );
    expect(peer.dataChannels).toEqual([
      "CONTROL_DATA_CHANNEL",
      "TEXT_DATA_CHANNEL",
      "STREAMER_DATA_CHANNEL",
      "FILE_DATA_CHANNEL",
      "BINARY_DATA_CHANNEL",
    ]);
    expect(api.soacCalls).toEqual([
      {
        type: "offer",
        clientId: "controlled-1",
        iceId: "ice-1",
        appControlId: "control-1",
        sdp: "v=0 browser offer",
        gzipSdp: true,
        iceNetworkType: 3,
      },
    ]);
    peer.onicecandidate?.({
      candidate: {
        toJSON: () => ({ candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host", sdpMid: "0", sdpMLineIndex: 0 }),
      },
    } as RTCPeerConnectionIceEvent);
    await Promise.resolve();
    expect(api.soacCalls.at(-1)).toMatchObject({
      type: "candidate",
      clientId: "controlled-1",
      iceId: "ice-1",
      appControlId: "control-1",
      candidate: {
        candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
      },
    });
    expect(api.soacCalls.at(-1)).not.toHaveProperty("iceNetworkType");
  });

  it("negotiates high-quality stereo Opus and signals the browser-normalized local offer", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    peer.offerSdp =
      [
        "v=0",
        "m=video 9 UDP/TLS/RTP/SAVPF 111",
        "a=rtpmap:111 H264/90000",
        "a=fmtp:111 profile-level-id=42e01f",
        "m=audio 9 UDP/TLS/RTP/SAVPF 109",
        "a=rtpmap:109 opus/48000/2",
        "a=fmtp:109 minptime=10;useinbandfec=1",
      ].join("\r\n") + "\r\n";
    peer.localDescriptionSdpSuffix = "a=x-browser-normalized:1\r\n";
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => peer,
    });

    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });

    expect(peer.localDescription?.sdp).toContain(
      "a=fmtp:109 minptime=10;stereo=1;useinbandfec=1;maxplaybackrate=48000;maxaveragebitrate=128000\r\n",
    );
    expect(peer.localDescription?.sdp).toContain("a=fmtp:111 profile-level-id=42e01f\r\n");
    expect(api.soacCalls[0].sdp).toBe(peer.localDescription?.sdp);
    expect(api.soacCalls[0].sdp).toMatch(/a=x-browser-normalized:1\r\n$/);
  });

  it("keeps a closed session idle when signal control resolves after close", async () => {
    const controlGate = deferred<void>();
    const api = new FakeRemoteApi();
    const originalSendSignalControl = api.sendSignalControl.bind(api);
    const sendSignalControl = vi.spyOn(api, "sendSignalControl").mockImplementation(async (input) => {
      await controlGate.promise;
      return originalSendSignalControl(input);
    });
    const createPeerConnection = vi.fn(() => new FakePeerConnection());
    const observedStages: string[] = [];
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection,
      onStateChange: (state) => observedStages.push(state.stage),
    });

    const startPromise = session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    await vi.waitFor(() => expect(sendSignalControl).toHaveBeenCalledOnce());
    const rejection = expect(startPromise).rejects.toMatchObject({ name: "AbortError" });

    session.close();
    controlGate.resolve(undefined);
    await rejection;

    expect(createPeerConnection).not.toHaveBeenCalled();
    expect(api.soacCalls).toEqual([]);
    expect(session.getState().stage).toBe("idle");
    expect(observedStages).toEqual(["idle"]);
  });

  it("closes an in-flight peer and suppresses stale callbacks when close interrupts createOffer", async () => {
    const offer = deferred<RTCSessionDescriptionInit>();
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    peer.createOfferPromise = offer.promise;
    const observedStages: string[] = [];
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => peer,
      onStateChange: (state) => observedStages.push(state.stage),
    });

    const startPromise = session.start({
      appControlId: "control-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });
    await vi.waitFor(() => expect(peer.createOfferCalls).toEqual([undefined]));
    const control = peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.control)!;
    const staleOpenCallback = control.onopen;
    const rejection = expect(startPromise).rejects.toMatchObject({ name: "AbortError" });

    session.close();
    offer.resolve({ type: "offer", sdp: "v=0 stale browser offer" });
    await rejection;
    staleOpenCallback?.(new Event("open"));

    expect(peer.closed).toBe(true);
    expect(peer.onicecandidate).toBeNull();
    expect(peer.ontrack).toBeNull();
    expect([...peer.channels.values()].every((channel) => channel.closed)).toBe(true);
    expect(peer.localDescription).toBeNull();
    expect(api.soacCalls).toEqual([]);
    expect(session.getState().stage).toBe("idle");
    expect(observedStages.at(-1)).toBe("idle");
    expect(observedStages).not.toContain("offered");
  });

  it("does not restore connected state when close interrupts a remote answer", async () => {
    const remoteDescriptionGate = deferred<void>();
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    peer.setRemoteDescriptionPromise = remoteDescriptionGate.promise;
    const observedStages: string[] = [];
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => peer,
      onStateChange: (state) => observedStages.push(state.stage),
    });
    await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
    const setRemoteDescription = vi.spyOn(peer, "setRemoteDescription");

    const applyingAnswer = session.applySignalEvents([
      soacEvent(1, {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0 controlled answer" },
      }),
    ]);
    await vi.waitFor(() => expect(setRemoteDescription).toHaveBeenCalledOnce());

    session.close();
    remoteDescriptionGate.resolve(undefined);
    await expect(applyingAnswer).resolves.toBeUndefined();

    expect(session.getState().stage).toBe("idle");
    expect(observedStages.at(-1)).toBe("idle");
    expect(observedStages).not.toContain("connected");
  });

  it("keeps H264 RTX codec preferences so lossy relay links can negotiate retransmission", async () => {
    const api = new FakeRemoteApi();
    const peer = new FakePeerConnection();
    vi.stubGlobal("RTCRtpSender", {
      getCapabilities: () => ({
        codecs: [
          { mimeType: "video/VP8", clockRate: 90000 },
          { mimeType: "video/rtx", clockRate: 90000 },
          {
            mimeType: "video/H264",
            clockRate: 90000,
            sdpFmtpLine: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
          },
        ],
      }),
    });
    try {
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

      expect(peer.videoCodecPreferenceCalls[0].map((codec) => codec.mimeType)).toEqual(["video/H264", "video/rtx"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops before creating WebRTC when signal control ack returns a nonzero ControlResult", async () => {
    const soacCalls: RemoteSignalSoacRequest[] = [];
    const api = {
      async sendSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult> {
        expect(input.appControlId).toBe("control-1");
        return {
          event: "control",
          ackStatus: "fail",
          ack: ["fail", { code: 100002, msg: "rejected" }],
          control: {
            ackStatus: "fail",
            result: {
              clientId: "controlled-1",
              iceId: "ice-1",
              code: 100002,
              msg: "rejected",
              iceServers: [],
            },
          },
          emittedAt: "2026-05-15T00:00:00.000Z",
          ackReceivedAt: "2026-05-15T00:00:00.100Z",
        };
      },
      async sendSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult> {
        soacCalls.push(input);
        return { event: "soac", payload: input, emittedAt: "2026-05-15T00:00:00.200Z" };
      },
    };
    let peerCreated = false;
    const session = new BrowserRemoteSession({
      api,
      createPeerConnection: () => {
        peerCreated = true;
        return new FakePeerConnection();
      },
    });

    await expect(
      session.start({
        appControlId: "control-1",
        appDataBase64: "Cg==",
        streamerData: "{}",
      }),
    ).rejects.toThrow("signal control ack failed: ack=fail code=100002 protocol=protocol_error_2022 msg=rejected");

    expect(peerCreated).toBe(false);
    expect(soacCalls).toHaveLength(0);
  });

  it("uses the control ack ICE id for SOAC even when a pre-control fallback id is present", async () => {
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
      iceId: "web-ice-1",
      appDataBase64: "Cg==",
      streamerData: "{}",
    });

    expect(session.getState()).toMatchObject({
      iceId: "ice-1",
      controlResultIceId: "ice-1",
      controlIceIdMatch: false,
    });
    expect(api.soacCalls[0]).toMatchObject({
      type: "offer",
      iceId: "ice-1",
    });
  });

  it("queues inbound SOAC candidates until the answer is applied", async () => {
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

    await session.applySignalEvents([
      soacEvent(1, {
        client_id: "controlled-1",
        data: {
          type: "candidate",
          candidate: {
            candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        },
      }),
      soacEvent(2, {
        client_id: "controlled-1",
        data: {
          type: "answer",
          sdp: "v=0 controlled answer",
        },
      }),
    ]);

    expect(peer.remoteDescriptions).toEqual([{ type: "answer", sdp: "v=0 controlled answer" }]);
    expect(peer.candidates).toEqual([
      {
        candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
    ]);
  });
});
