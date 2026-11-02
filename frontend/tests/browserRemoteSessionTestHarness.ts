import type {
  RemoteSignalControlRequest,
  RemoteSignalControlResult,
  RemoteSignalGatewayEvent,
  RemoteSignalSoacRequest,
  RemoteSignalSoacResult,
} from "@uurc/shared/signalGateway/model";
import { STREAMER_DATA_CHANNEL_LABELS } from "@uurc/shared/streamer/transport";
import { BrowserRemoteSession } from "../src/remote/browserRemoteSession.js";

export async function startClipboardSession(
  options: {
    now?: () => number;
    onRemoteClipboard?: (text: string) => void;
  } = {},
): Promise<{
  peer: FakePeerConnection;
  session: BrowserRemoteSession;
  fileChannel: FakeDataChannel;
  textChannel: FakeDataChannel;
}> {
  const api = new FakeRemoteApi();
  const peer = new FakePeerConnection();
  const session = new BrowserRemoteSession({
    api,
    createPeerConnection: () => peer,
    ...options,
  });
  await session.start({ appControlId: "control-1", appDataBase64: "Cg==", streamerData: "{}" });
  return {
    peer,
    session,
    fileChannel: peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.file)!,
    textChannel: peer.channels.get(STREAMER_DATA_CHANNEL_LABELS.text)!,
  };
}

export function blobFromBytes(bytes: Uint8Array): Blob {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([buffer]);
}

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export function clipboardDataBlockRequest(input: {
  sequence: number;
  requestId: number;
  blockKey: string;
  blockId: number;
  data: Uint8Array;
}): Uint8Array {
  const header = protobufVarintField(1, input.requestId);
  const block = [
    ...protobufBytesField(1, new TextEncoder().encode(input.blockKey)),
    ...(input.blockId === 0 ? [] : protobufVarintField(2, input.blockId)),
    ...protobufBytesField(3, input.data),
  ];
  const clipboardRequest = protobufBytesField(3, new Uint8Array(block));
  const rpcRequest = [
    ...protobufBytesField(1, new Uint8Array(header)),
    ...protobufBytesField(9, new Uint8Array(clipboardRequest)),
  ];
  return new Uint8Array([
    ...protobufVarintField(1, input.sequence),
    ...protobufVarintField(2, input.sequence + 1),
    ...protobufBytesField(21, new Uint8Array(rpcRequest)),
  ]);
}

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function protobufVarintField(tag: number, value: number): number[] {
  return [...protobufVarint(tag * 8), ...protobufVarint(value)];
}

export function protobufBytesField(tag: number, value: Uint8Array): number[] {
  return [...protobufVarint(tag * 8 + 2), ...protobufVarint(value.byteLength), ...value];
}

export function protobufVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return bytes;
}

export function soacEvent(id: number, payload: unknown): RemoteSignalGatewayEvent {
  return {
    id,
    direction: "inbound",
    event: "soac",
    receivedAt: "2026-05-15T00:00:00.000Z",
    payload: [payload],
  };
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

export function cursorShapeControlMessage(screenId: number): Uint8Array {
  const cursorShape = [
    0x08,
    0x02,
    0x10,
    0x03,
    0x18,
    0x10,
    0x20,
    0x18,
    0x2a,
    0x04,
    0x01,
    0x02,
    0x03,
    0x04,
    0x30,
    0x09,
    0x48,
    screenId,
  ];
  const systemStateChange = [0x12, cursorShape.length, ...cursorShape];
  return new Uint8Array([0x7a, systemStateChange.length, ...systemStateChange]);
}

export function makeInboundVideoStats(input: {
  packetsReceived: number;
  bytesReceived: number;
  framesDecoded: number;
  framesReceived?: number;
  framesDropped?: number;
  keyFramesDecoded?: number;
  pliCount?: number;
  nackCount?: number;
  firCount?: number;
  freezeCount?: number;
}): Map<string, Record<string, unknown>> {
  return new Map<string, Record<string, unknown>>([
    [
      "video-1",
      {
        id: "video-1",
        type: "inbound-rtp",
        kind: "video",
        packetsReceived: input.packetsReceived,
        bytesReceived: input.bytesReceived,
        framesDecoded: input.framesDecoded,
        framesReceived: input.framesReceived ?? input.framesDecoded,
        framesDropped: input.framesDropped,
        keyFramesDecoded: input.keyFramesDecoded,
        pliCount: input.pliCount,
        nackCount: input.nackCount,
        firCount: input.firCount,
        freezeCount: input.freezeCount,
        codecId: "codec-1",
        decoderImplementation: "VideoToolbox",
        timestamp: 123456,
      },
    ],
    [
      "codec-1",
      {
        id: "codec-1",
        type: "codec",
        mimeType: "video/H264",
        payloadType: 102,
        clockRate: 90000,
      },
    ],
    [
      "pair-1",
      {
        id: "pair-1",
        type: "candidate-pair",
        selected: true,
        state: "succeeded",
        localCandidateId: "local-1",
        remoteCandidateId: "remote-1",
        bytesReceived: input.bytesReceived,
        bytesSent: 2048,
      },
    ],
    ["local-1", { id: "local-1", type: "local-candidate", candidateType: "host", address: "192.168.1.20" }],
    ["remote-1", { id: "remote-1", type: "remote-candidate", candidateType: "host", address: "192.168.1.30" }],
  ]);
}

export class FakeRemoteApi {
  readonly controlCalls: RemoteSignalControlRequest[] = [];
  readonly soacCalls: RemoteSignalSoacRequest[] = [];

  constructor(
    private readonly controlResultOverrides: Partial<NonNullable<RemoteSignalControlResult["control"]["result"]>> = {},
  ) {}

  async sendSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult> {
    this.controlCalls.push(input);
    return {
      event: "control",
      ackStatus: "success",
      ack: [],
      control: {
        ackStatus: "success",
        result: {
          clientId: "controlled-1",
          iceId: "ice-1",
          iceServers: [
            {
              urls: "turn:relay.example:3478?transport=udp",
              username: "turn-user",
              credential: "turn-pass",
            },
          ],
          ...this.controlResultOverrides,
        },
      },
      emittedAt: "2026-05-15T00:00:00.000Z",
      ackReceivedAt: "2026-05-15T00:00:00.100Z",
    };
  }

  async sendSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult> {
    this.soacCalls.push(input);
    return {
      event: "soac",
      payload: input,
      emittedAt: "2026-05-15T00:00:00.200Z",
    };
  }
}

export class FakePeerConnection {
  configuration: unknown;
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  signalingState: RTCSignalingState = "stable";
  onconnectionstatechange: ((event: Event) => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  oniceconnectionstatechange: ((event: Event) => void) | null = null;
  onicegatheringstatechange: ((event: Event) => void) | null = null;
  onsignalingstatechange: ((event: Event) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  readonly transceivers: Array<{ kind: string; direction?: RTCRtpTransceiverDirection }> = [];
  readonly dataChannels: string[] = [];
  readonly videoCodecPreferenceCalls: RTCRtpCodecCapability[][] = [];
  readonly channels = new Map<string, FakeDataChannel>();
  readonly remoteDescriptions: RTCSessionDescriptionInit[] = [];
  readonly candidates: RTCIceCandidateInit[] = [];
  readonly createOfferCalls: Array<RTCOfferOptions | undefined> = [];
  createOfferPromise: Promise<RTCSessionDescriptionInit> | undefined;
  offerSdp: string | undefined;
  localDescriptionSdpSuffix: string | undefined;
  setRemoteDescriptionPromise: Promise<void> | undefined;
  setRemoteDescriptionShouldThrow = false;
  closed = false;
  restartIceCalls = 0;
  stats: Map<string, Record<string, unknown>> = new Map();

  createDataChannel(label: string): FakeDataChannel {
    this.dataChannels.push(label);
    const channel = new FakeDataChannel(label);
    this.channels.set(label, channel);
    return channel;
  }

  emitIncomingDataChannel(label: string): FakeDataChannel {
    const channel = new FakeDataChannel(label);
    this.ondatachannel?.({ channel } as unknown as RTCDataChannelEvent);
    return channel;
  }

  addTransceiver(kind: "audio" | "video", init?: RTCRtpTransceiverInit): RTCRtpTransceiver {
    this.transceivers.push({ kind, direction: init?.direction });
    return {
      setCodecPreferences: (codecs: RTCRtpCodecCapability[]) => {
        if (kind === "video") this.videoCodecPreferenceCalls.push(codecs);
      },
    } as RTCRtpTransceiver;
  }

  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    this.createOfferCalls.push(options);
    if (this.createOfferPromise) return this.createOfferPromise;
    return {
      type: "offer",
      sdp: this.offerSdp ?? (options?.iceRestart ? "v=0 browser restart offer" : "v=0 browser offer"),
    };
  }

  restartIce(): void {
    this.restartIceCalls += 1;
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription =
      description.sdp && this.localDescriptionSdpSuffix
        ? { ...description, sdp: `${description.sdp}${this.localDescriptionSdpSuffix}` }
        : description;
    if (description.type === "offer") {
      this.signalingState = "have-local-offer";
    } else if (description.type === "answer") {
      this.signalingState = "stable";
    }
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (this.setRemoteDescriptionPromise) await this.setRemoteDescriptionPromise;
    if (this.setRemoteDescriptionShouldThrow) {
      throw new Error("InvalidStateError: setRemoteDescription wrong state");
    }
    this.remoteDescription = description;
    this.remoteDescriptions.push(description);
    if (description.type === "answer") {
      this.signalingState = "stable";
    } else if (description.type === "offer") {
      this.signalingState = "have-remote-offer";
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.candidates.push(candidate);
  }

  async getStats(): Promise<Map<string, Record<string, unknown>>> {
    return this.stats;
  }

  close(): void {
    this.closed = true;
  }
}

export class FakeDataChannel {
  binaryType: BinaryType = "arraybuffer";
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onbufferedamountlow: ((event: Event) => void) | null = null;
  readyState: RTCDataChannelState = "open";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  readonly sent: Array<string | Blob | ArrayBuffer | ArrayBufferView> = [];
  failNextSendCount = 0;
  closed = false;

  constructor(readonly label: string) {}

  send(data: string | Blob | ArrayBuffer | ArrayBufferView): void {
    if (this.failNextSendCount > 0) {
      this.failNextSendCount -= 1;
      throw new Error("send failed");
    }
    this.sent.push(data);
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitBufferedAmountLow(): void {
    this.onbufferedamountlow?.(new Event("bufferedamountlow"));
  }

  close(): void {
    this.closed = true;
    this.readyState = "closed";
    this.onclose?.(new Event("close"));
  }
}
