import type { RemoteConnectionQuality, RemoteConnectionQualityMetric } from "../app/remoteControlTypes.js";
import type { BrowserRemoteSessionState } from "./browserRemoteSessionTypes.js";
import { formatDataChannelState, formatVideoFlow } from "./remoteSessionUiModel.js";

interface ConnectionQualityInput {
  state: BrowserRemoteSessionState;
  controlChannelState: RTCDataChannelState;
  inputControlActive: boolean;
  textChannelState: RTCDataChannelState;
  connectionPathLabel: string;
}

export function getRemoteConnectionQuality(input: ConnectionQualityInput): RemoteConnectionQuality {
  const metrics = buildConnectionQualityMetrics(input);
  if (input.state.stage !== "connected") return quality("pending", "等待连接", metrics);
  if (input.controlChannelState === "closed") return quality("bad", "控制连接断开", metrics);
  if (input.state.videoFlow?.status === "transport_stalled") {
    return quality("bad", "画面中断", metrics, input.state.videoFlow.detail);
  }
  if (input.state.videoFlow?.status === "decode_stalled") {
    return quality("warn", "画面卡顿", metrics, input.state.videoFlow.detail);
  }
  if (input.state.videoFlow?.status === "presentation_stalled") {
    return quality("warn", "画面卡顿", metrics, input.state.videoFlow.detail);
  }
  if (input.state.videoFlow?.status === "receiving") return quality("good", "连接正常", metrics);
  return quality("pending", "等待质量采样", metrics);
}

function buildConnectionQualityMetrics(input: ConnectionQualityInput): RemoteConnectionQualityMetric[] {
  const baseMetrics: RemoteConnectionQualityMetric[] = [
    { label: "路径", value: input.connectionPathLabel },
    { label: "画面", value: formatVideoFlow(input.state) },
    { label: "输入", value: formatInputControlState(input.inputControlActive, input.controlChannelState) },
    { label: "控制通道", value: formatDataChannelState(input.controlChannelState) },
    { label: "文本通道", value: formatDataChannelState(input.textChannelState) },
  ];
  if (input.state.stage !== "connected") return baseMetrics;

  const stats = input.state.inboundVideo;
  const pair = input.state.selectedCandidatePair;
  const flowDelta = input.state.videoFlow?.delta;
  const videoElement = input.state.videoElement;
  const receiveBitrateBps = bitrateFromBytes(
    flowDelta?.bytesReceived ?? flowDelta?.candidateBytesReceived,
    flowDelta?.sampleIntervalMs,
  );
  const decodedFps = fpsFromDelta(
    flowDelta?.framesDecoded ?? flowDelta?.framesReceived ?? flowDelta?.videoElementFrames,
    flowDelta?.sampleIntervalMs,
  );

  return [
    ...baseMetrics,
    { label: "帧率", value: formatFps(stats?.framesPerSecond ?? decodedFps) ?? "采样中" },
    { label: "接收码率", value: formatBitrate(receiveBitrateBps) ?? "采样中" },
    { label: "延迟", value: formatSecondsAsMs(pair?.currentRoundTripTime) ?? "采样中" },
    {
      label: "分辨率",
      value:
        formatResolution(stats?.frameWidth ?? videoElement?.width, stats?.frameHeight ?? videoElement?.height) ??
        "暂无",
    },
    { label: "丢帧", value: formatFrameCount(stats?.framesDropped ?? videoElement?.droppedVideoFrames) ?? "0 帧" },
    { label: "冻结", value: formatCount(stats?.freezeCount) ?? "0 次" },
    { label: "丢包", value: formatPacketLoss(stats?.packetsLost, stats?.packetsReceived) ?? "0 包 · 0%" },
    {
      label: "抖动缓冲",
      value: formatAverageSecondsAsMs(stats?.jitterBufferDelay, stats?.jitterBufferEmittedCount) ?? "采样中",
    },
    { label: "下行余量", value: formatBitrate(pair?.availableIncomingBitrate) ?? "暂无" },
    { label: "上行余量", value: formatBitrate(pair?.availableOutgoingBitrate) ?? "暂无" },
    { label: "解码器", value: stats?.decoderImplementation ?? "暂无" },
  ];
}

function quality(
  state: RemoteConnectionQuality["state"],
  title: string,
  metrics: RemoteConnectionQualityMetric[],
  detail = "",
): RemoteConnectionQuality {
  return { state, title, detail, metrics };
}

function formatInputControlState(inputControlActive: boolean, controlChannelState: RTCDataChannelState): string {
  if (inputControlActive) return "控制中";
  if (controlChannelState === "open") return "仅查看";
  return "未连接";
}

function bitrateFromBytes(bytes: number | undefined, intervalMs: number | undefined): number | undefined {
  if (bytes === undefined || bytes <= 0 || intervalMs === undefined || intervalMs <= 0) return undefined;
  return (bytes * 8 * 1000) / intervalMs;
}

function fpsFromDelta(frames: number | undefined, intervalMs: number | undefined): number | undefined {
  if (frames === undefined || frames <= 0 || intervalMs === undefined || intervalMs <= 0) return undefined;
  return (frames * 1000) / intervalMs;
}

function formatFps(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} fps`;
}

function formatBitrate(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 1_000_000) return `${formatCompactNumber(value / 1_000_000)} Mbps`;
  return `${formatCompactNumber(value / 1_000)} Kbps`;
}

function formatSecondsAsMs(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || value < 0) return null;
  return `${Math.round(value * 1000)} ms`;
}

function formatAverageSecondsAsMs(totalSeconds: number | undefined, count: number | undefined): string | null {
  if (totalSeconds === undefined || count === undefined || totalSeconds < 0 || count <= 0) return null;
  return `${Math.round((totalSeconds / count) * 1000)} ms`;
}

function formatResolution(width: number | undefined, height: number | undefined): string | null {
  return width && height ? `${Math.round(width)}x${Math.round(height)}` : null;
}

function formatFrameCount(value: number | undefined): string | null {
  return value === undefined || value < 0 ? null : `${Math.round(value)} 帧`;
}

function formatCount(value: number | undefined): string | null {
  return value === undefined || value < 0 ? null : `${Math.round(value)} 次`;
}

function formatPacketLoss(lost: number | undefined, received: number | undefined): string | null {
  if (lost === undefined || lost < 0) return null;
  if (received === undefined || received < 0 || received + lost <= 0) return `${Math.round(lost)} 包`;
  return `${Math.round(lost)} 包 · ${formatCompactNumber((lost / (received + lost)) * 100)}%`;
}

function formatCompactNumber(value: number): string {
  const rounded = value >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
