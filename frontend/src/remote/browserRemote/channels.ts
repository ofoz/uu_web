import {
  decodeStreamerControlMessage,
  type DecodedStreamerControlMessage,
} from "@uurc/shared/streamer/controlChannelDecode";
import {
  encodeStreamerEchoRequestMessage,
  encodeStreamerEchoResponseMessage,
} from "@uurc/shared/streamer/controlChannelEncode";
import { STREAMER_SIMPLE_ACTION_TYPES } from "@uurc/shared/streamer/controlChannelProtocol";
import {
  STREAMER_DATA_CHANNEL_LABELS,
  isStreamerDataChannelLabel,
  type StreamerDataChannelLabel,
} from "@uurc/shared/streamer/transport";
import type {
  BrowserRemoteDataChannel,
  BrowserRemoteDebugEventKind,
  BrowserRemotePeerConnection,
} from "../browserRemoteSessionTypes.js";
import {
  dataChannelPayloadByteLength,
  dataChannelPayloadBytes,
  summarizeDataChannelPayload,
  summarizeDecodedControlMessage,
} from "./dataChannel.js";
import { getErrorMessage } from "./utils.js";

interface DataChannelEnvelope {
  sequence: number;
  timestampSeconds: number;
}

interface DataChannelSendEvent {
  summary: string;
  details?: Record<string, unknown>;
}

interface BrowserRemoteChannelsOptions {
  handleClipboardMessage(label: StreamerDataChannelLabel, data: unknown): boolean;
  isGenerationCurrent(generation: number): boolean;
  nextEnvelope(): DataChannelEnvelope;
  now(): number;
  onBufferedAmountLow(): void;
  onClipboardUnavailable(reason: string): void;
  onControlMessage(message: DecodedStreamerControlMessage): void;
  onControlUnavailable(): void;
  onReadyStateChange(label: StreamerDataChannelLabel, state: RTCDataChannelState): void;
  recordDebugEvent(kind: BrowserRemoteDebugEventKind, summary: string, details?: Record<string, unknown>): void;
}

const ECHO_HEARTBEAT_INTERVAL_MS = 100;
const DATA_RECEIVE_DEBUG_INTERVAL_MS = 30000;

export class BrowserRemoteChannels {
  private readonly channels = new Map<StreamerDataChannelLabel, BrowserRemoteDataChannel>();
  private readonly incomingChannels = new Set<BrowserRemoteDataChannel>();
  private readonly lastDataReceiveDebugAtMs = new Map<StreamerDataChannelLabel, number>();
  private echoHeartbeatTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: BrowserRemoteChannelsOptions) {}

  create(peer: BrowserRemotePeerConnection, generation: number, controlLowThreshold: number): void {
    for (const label of Object.values(STREAMER_DATA_CHANNEL_LABELS)) {
      const channel = peer.createDataChannel(label);
      channel.binaryType = "arraybuffer";
      if (label === STREAMER_DATA_CHANNEL_LABELS.control) {
        channel.bufferedAmountLowThreshold = controlLowThreshold;
        channel.onbufferedamountlow = () => {
          if (this.options.isGenerationCurrent(generation)) this.options.onBufferedAmountLow();
        };
      }
      channel.onopen = () => {
        if (!this.options.isGenerationCurrent(generation)) return;
        this.options.recordDebugEvent("data_channel", `${label} open`, { label, readyState: channel.readyState });
        this.publishReadyState(label, channel);
        if (label === STREAMER_DATA_CHANNEL_LABELS.control) this.startEchoHeartbeat();
      };
      channel.onclose = () => {
        if (!this.options.isGenerationCurrent(generation)) return;
        this.options.recordDebugEvent("data_channel", `${label} close`, { label, readyState: channel.readyState });
        if (label === STREAMER_DATA_CHANNEL_LABELS.control) {
          console.warn(`[uurc] 控制数据通道关闭（${label}）→ 心跳停止，被控端可能停推画面`);
          this.options.onControlUnavailable();
          this.stopEchoHeartbeat();
        } else if (label === STREAMER_DATA_CHANNEL_LABELS.text || label === STREAMER_DATA_CHANNEL_LABELS.file) {
          this.options.onClipboardUnavailable("剪贴板数据通道已关闭");
        }
        this.publishReadyState(label, channel);
      };
      channel.onerror = () => {
        if (!this.options.isGenerationCurrent(generation)) return;
        this.options.recordDebugEvent("data_channel", `${label} error`, { label, readyState: channel.readyState });
        if (label === STREAMER_DATA_CHANNEL_LABELS.control && channel.readyState !== "open") {
          console.warn(`[uurc] 控制数据通道错误（${label}），readyState=${channel.readyState}`);
          this.options.onControlUnavailable();
          this.stopEchoHeartbeat();
        } else if (
          (label === STREAMER_DATA_CHANNEL_LABELS.text || label === STREAMER_DATA_CHANNEL_LABELS.file) &&
          channel.readyState !== "open"
        ) {
          this.options.onClipboardUnavailable("剪贴板数据通道发生错误");
        }
        this.publishReadyState(label, channel);
      };
      channel.onmessage = (event) => {
        if (this.options.isGenerationCurrent(generation)) this.receive(label, event.data, generation);
      };
      this.channels.set(label, channel);
    }
  }

  attachIncoming(channel: BrowserRemoteDataChannel, generation: number): void {
    this.incomingChannels.add(channel);
    channel.binaryType = "arraybuffer";
    const label = channel.label;
    this.options.recordDebugEvent("data_channel", "收到远端创建的数据通道", {
      label,
      readyState: channel.readyState,
      recognized: isStreamerDataChannelLabel(label),
    });
    channel.onopen = () => {
      if (this.options.isGenerationCurrent(generation)) {
        this.options.recordDebugEvent("data_channel", `${label} remote open`, {
          label,
          readyState: channel.readyState,
        });
      }
    };
    channel.onclose = () => {
      this.incomingChannels.delete(channel);
      if (this.options.isGenerationCurrent(generation)) {
        this.options.recordDebugEvent("data_channel", `${label} remote close`, {
          label,
          readyState: channel.readyState,
        });
      }
    };
    channel.onerror = () => {
      if (this.options.isGenerationCurrent(generation)) {
        this.options.recordDebugEvent("data_channel", `${label} remote error`, {
          label,
          readyState: channel.readyState,
        });
      }
    };
    channel.onmessage = isStreamerDataChannelLabel(label)
      ? (event) => {
          if (this.options.isGenerationCurrent(generation)) this.receive(label, event.data, generation);
        }
      : null;
  }

  get(label: StreamerDataChannelLabel): BrowserRemoteDataChannel | undefined {
    return this.channels.get(label);
  }

  getStates(): Partial<Record<StreamerDataChannelLabel, RTCDataChannelState>> {
    const states: Partial<Record<StreamerDataChannelLabel, RTCDataChannelState>> = {};
    for (const [label, channel] of this.channels) states[label] = channel.readyState;
    return states;
  }

  send(
    label: StreamerDataChannelLabel,
    payload: string | Uint8Array,
    event: DataChannelSendEvent | false | undefined = undefined,
  ): void {
    const channel = this.channels.get(label);
    if (!channel) throw new Error(`${label} has not been created`);
    if (channel.readyState !== "open") throw new Error(`${label} is ${channel.readyState}, not open`);
    channel.send(payload);
    if (event !== false) {
      this.options.recordDebugEvent("data_send", event?.summary ?? `发送 ${label}`, {
        label,
        byteLength: dataChannelPayloadByteLength(payload),
        frameType: typeof payload === "string" ? "text" : "binary",
        ...(event?.details ?? {}),
      });
    }
    this.publishReadyState(label, channel);
  }

  sendEchoResponse(responseSequence: number): void {
    const label = STREAMER_DATA_CHANNEL_LABELS.control;
    const channel = this.channels.get(label);
    if (!channel || channel.readyState !== "open") return;
    const { sequence, timestampSeconds } = this.options.nextEnvelope();
    const payload = encodeStreamerEchoResponseMessage({
      sequence,
      timestampMs: timestampSeconds,
      responseSequence,
    });
    try {
      this.send(label, payload, false);
    } catch (error) {
      this.options.recordDebugEvent("data_send", "回复控制 EchoRequest 失败", {
        label,
        sequence,
        responseSequence,
        readyState: channel.readyState,
        error: getErrorMessage(error),
      });
    }
  }

  closeAll(): void {
    this.stopEchoHeartbeat();
    for (const channel of this.channels.values()) this.closeChannel(channel);
    this.channels.clear();
    for (const channel of this.incomingChannels) this.closeChannel(channel);
    this.incomingChannels.clear();
    this.lastDataReceiveDebugAtMs.clear();
  }

  private startEchoHeartbeat(): void {
    if (this.echoHeartbeatTimer !== undefined) return;
    this.options.recordDebugEvent("data_channel", "启动控制心跳", {
      label: STREAMER_DATA_CHANNEL_LABELS.control,
      intervalMs: ECHO_HEARTBEAT_INTERVAL_MS,
    });
    this.sendEchoHeartbeat();
    this.echoHeartbeatTimer = setInterval(() => this.sendEchoHeartbeat(), ECHO_HEARTBEAT_INTERVAL_MS);
  }

  private stopEchoHeartbeat(): void {
    if (this.echoHeartbeatTimer !== undefined) {
      clearInterval(this.echoHeartbeatTimer);
      this.echoHeartbeatTimer = undefined;
    }
  }

  private sendEchoHeartbeat(): void {
    const label = STREAMER_DATA_CHANNEL_LABELS.control;
    const channel = this.channels.get(label);
    if (!channel || channel.readyState !== "open") {
      this.stopEchoHeartbeat();
      return;
    }
    const { sequence, timestampSeconds } = this.options.nextEnvelope();
    const payload = encodeStreamerEchoRequestMessage({ sequence, timestampMs: timestampSeconds });
    try {
      channel.send(payload);
    } catch (error) {
      this.options.recordDebugEvent("data_send", "控制心跳发送失败", {
        label,
        sequence,
        readyState: channel.readyState,
        error: getErrorMessage(error),
      });
      if (channel.readyState !== "open") this.stopEchoHeartbeat();
      return;
    }
  }

  private receive(label: StreamerDataChannelLabel, data: unknown, generation: number): void {
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      void data
        .arrayBuffer()
        .then((buffer) => {
          if (this.options.isGenerationCurrent(generation)) this.recordMessage(label, buffer);
        })
        .catch((error: unknown) => {
          if (!this.options.isGenerationCurrent(generation)) return;
          this.options.recordDebugEvent("data_recv", "读取 DataChannel Blob 失败", {
            label,
            payloadType: "blob",
            byteLength: data.size,
            error: getErrorMessage(error),
          });
        });
      return;
    }
    this.recordMessage(label, data);
  }

  private recordMessage(label: StreamerDataChannelLabel, data: unknown): void {
    if (
      (label === STREAMER_DATA_CHANNEL_LABELS.file || label === STREAMER_DATA_CHANNEL_LABELS.text) &&
      this.options.handleClipboardMessage(label, data)
    ) {
      return;
    }
    const decoded = label === STREAMER_DATA_CHANNEL_LABELS.control ? this.decodeControlMessage(data) : undefined;
    if (decoded) this.options.onControlMessage(decoded);
    const simpleAction = decoded?.simpleAction?.action;
    if (
      simpleAction === STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST ||
      simpleAction === STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_RESPONSE
    ) {
      return;
    }

    const now = this.options.now();
    const lastDebugAtMs = this.lastDataReceiveDebugAtMs.get(label) ?? 0;
    if (lastDebugAtMs > 0 && now - lastDebugAtMs < DATA_RECEIVE_DEBUG_INTERVAL_MS) return;
    this.lastDataReceiveDebugAtMs.set(label, now || 1);
    this.options.recordDebugEvent("data_recv", `收到 ${label} 数据`, {
      label,
      ...summarizeDataChannelPayload(data, {
        includeHexPrefix: label !== STREAMER_DATA_CHANNEL_LABELS.file && label !== STREAMER_DATA_CHANNEL_LABELS.text,
      }),
      decoded: decoded ? summarizeDecodedControlMessage(decoded) : undefined,
    });
  }

  private decodeControlMessage(data: unknown): DecodedStreamerControlMessage | undefined {
    const bytes = dataChannelPayloadBytes(data);
    if (!bytes) return undefined;
    try {
      return decodeStreamerControlMessage(bytes);
    } catch (error) {
      this.options.recordDebugEvent("data_recv", "控制数据解码失败", {
        error: getErrorMessage(error),
        ...summarizeDataChannelPayload(data),
      });
      return undefined;
    }
  }

  private publishReadyState(label: StreamerDataChannelLabel, channel: BrowserRemoteDataChannel): void {
    this.options.onReadyStateChange(label, channel.readyState);
  }

  private closeChannel(channel: BrowserRemoteDataChannel): void {
    channel.onopen = null;
    channel.onclose = null;
    channel.onerror = null;
    channel.onmessage = null;
    channel.onbufferedamountlow = null;
    if (channel.readyState !== "closed") channel.close?.();
  }
}
