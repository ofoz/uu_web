import { appBackend } from "./appBackendFixture.js";

export function buildStatsReport(input: {
  bytesReceived?: number;
  framesDecoded?: number;
  framesDropped?: number;
  framesPerSecond?: number;
  frameWidth?: number;
  frameHeight?: number;
  currentRoundTripTime?: number;
  timestamp?: number;
}): Map<string, Record<string, unknown>> {
  return new Map<string, Record<string, unknown>>([
    [
      "pair-1",
      {
        id: "pair-1",
        type: "candidate-pair",
        selected: true,
        state: "succeeded",
        localCandidateId: "local-1",
        remoteCandidateId: "remote-1",
        currentRoundTripTime: input.currentRoundTripTime,
      },
    ],
    [
      "local-1",
      { id: "local-1", type: "local-candidate", candidateType: "relay", protocol: "udp", address: "203.0.113.10" },
    ],
    ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "relay", address: "203.0.113.11" }],
    [
      "codec-1",
      {
        id: "codec-1",
        type: "codec",
        mimeType: "video/H264",
      },
    ],
    [
      "inbound-video-1",
      {
        id: "inbound-video-1",
        type: "inbound-rtp",
        kind: "video",
        codecId: "codec-1",
        bytesReceived: input.bytesReceived,
        framesDecoded: input.framesDecoded,
        framesDropped: input.framesDropped,
        framesPerSecond: input.framesPerSecond,
        frameWidth: input.frameWidth,
        frameHeight: input.frameHeight,
        timestamp: input.timestamp,
      },
    ],
  ]);
}

export function clipboardTextChangeResponse(requestId: bigint, result: number): Uint8Array {
  if (requestId < 0n || requestId > 0x7fn || result < 0 || result > 0x7f) {
    throw new RangeError("test Clipboard response fixture only supports one-byte varints");
  }
  return new Uint8Array([
    0x08,
    0x5b,
    0x10,
    0x5c,
    0xb2,
    0x01,
    0x08,
    0x0a,
    0x02,
    0x08,
    Number(requestId),
    0x32,
    0x02,
    0x08,
    result,
  ]);
}

export class TestPeerConnection {
  static lastConfiguration: RTCConfiguration | null = null;
  static current: TestPeerConnection | null = null;
  static sentByLabel: Record<string, number[]> = {};
  static channels: Record<string, RTCDataChannel> = {};
  static closed = false;
  static statsReports: Array<Map<string, Record<string, unknown>>> = [];
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;

  constructor(configuration?: RTCConfiguration) {
    TestPeerConnection.current = this;
    TestPeerConnection.lastConfiguration = configuration ?? null;
  }

  createDataChannel(label: string): RTCDataChannel {
    const channel = {
      label,
      readyState: "open",
      binaryType: "arraybuffer",
      onopen: null,
      onclose: null,
      onerror: null,
      send: (data: string | Blob | ArrayBuffer | ArrayBufferView) => {
        const bytes =
          data instanceof ArrayBuffer
            ? data.byteLength
            : ArrayBuffer.isView(data)
              ? data.byteLength
              : typeof data === "string"
                ? data.length
                : 0;
        TestPeerConnection.sentByLabel[label] = [...(TestPeerConnection.sentByLabel[label] ?? []), bytes];
      },
      close: () => {},
    } as unknown as RTCDataChannel;
    TestPeerConnection.channels[label] = channel;
    return channel;
  }

  addTransceiver(_kind: "audio" | "video", _init?: RTCRtpTransceiverInit): RTCRtpTransceiver {
    return {} as RTCRtpTransceiver;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "v=0 browser offer" };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
    for (const track of appBackend.remoteTrackPlan) {
      const mediaTrack = new FakeMediaStreamTrack(track.id, track.kind);
      const stream = new FakeMediaStream([mediaTrack]);
      this.ontrack?.({ track: mediaTrack, streams: [stream] } as unknown as RTCTrackEvent);
    }
  }

  async addIceCandidate(_candidate: RTCIceCandidateInit): Promise<void> {}

  async getStats(): Promise<Map<string, Record<string, unknown>>> {
    const nextReport = TestPeerConnection.statsReports.shift();
    if (nextReport) return nextReport;
    return new Map<string, Record<string, unknown>>([
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
  }

  close(): void {
    TestPeerConnection.closed = true;
  }

  static closeDataChannel(label: string): void {
    const channel = TestPeerConnection.channels[label];
    if (!channel) throw new Error(`Missing data channel ${label}`);
    Object.defineProperty(channel, "readyState", { value: "closed", configurable: true });
    channel.onclose?.(new Event("close"));
  }

  static emitIncomingDataChannel(label: string): RTCDataChannel {
    const peer = TestPeerConnection.current;
    if (!peer?.ondatachannel) throw new Error("Missing active peer data channel handler");
    const channel = {
      label,
      readyState: "open",
      binaryType: "blob",
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      send: () => undefined,
      close: () => undefined,
    } as unknown as RTCDataChannel;
    peer.ondatachannel({ channel } as RTCDataChannelEvent);
    return channel;
  }
}

export class FakeMediaStreamTrack {
  constructor(
    readonly id: string,
    readonly kind: "audio" | "video",
  ) {}
}

export class FakeMediaStream {
  private readonly tracks: FakeMediaStreamTrack[];

  constructor(tracks: FakeMediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }

  addTrack(track: FakeMediaStreamTrack): void {
    this.tracks.push(track);
  }

  getTracks(): FakeMediaStreamTrack[] {
    return [...this.tracks];
  }

  getVideoTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === "video");
  }
}
