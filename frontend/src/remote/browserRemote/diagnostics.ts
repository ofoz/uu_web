import { classifyStreamerConnectionPath, type StreamerConnectionPath } from "@uurc/shared/streamer/transport";
import type {
  BrowserRemoteInboundAudioStats,
  BrowserRemoteInboundVideoStats,
  BrowserRemoteSelectedCandidatePair,
  BrowserRemoteStatsReport,
  BrowserRemoteVideoElementSample,
  BrowserRemoteVideoFlowDelta,
  BrowserRemoteVideoFlowDiagnostics,
} from "../browserRemoteSessionTypes.js";
import { asRecord, dropUndefinedFields } from "./utils.js";

export interface BrowserRemoteStatsSample {
  inboundVideo?: BrowserRemoteInboundVideoStats;
  sampledAtMs: number;
  selectedCandidatePair?: BrowserRemoteSelectedCandidatePair;
}

export function diagnoseVideoFlow(input: {
  nowMs: number;
  previous: BrowserRemoteStatsSample | undefined;
  current: BrowserRemoteStatsSample;
  previousVideoElement?: BrowserRemoteVideoElementSample;
  currentVideoElement?: BrowserRemoteVideoElementSample;
}): BrowserRemoteVideoFlowDiagnostics {
  const currentInboundVideo = input.current.inboundVideo;
  const previousInboundVideo = isSameInboundVideo(input.previous?.inboundVideo, currentInboundVideo)
    ? input.previous?.inboundVideo
    : undefined;
  const delta: BrowserRemoteVideoFlowDelta = {
    packetsReceived: diffNumber(previousInboundVideo?.packetsReceived, currentInboundVideo?.packetsReceived),
    bytesReceived: diffNumber(previousInboundVideo?.bytesReceived, currentInboundVideo?.bytesReceived),
    framesDecoded: diffNumber(previousInboundVideo?.framesDecoded, currentInboundVideo?.framesDecoded),
    framesReceived: diffNumber(previousInboundVideo?.framesReceived, currentInboundVideo?.framesReceived),
    framesDropped: diffNumber(previousInboundVideo?.framesDropped, currentInboundVideo?.framesDropped),
    keyFramesDecoded: diffNumber(previousInboundVideo?.keyFramesDecoded, currentInboundVideo?.keyFramesDecoded),
    pliCount: diffNumber(previousInboundVideo?.pliCount, currentInboundVideo?.pliCount),
    nackCount: diffNumber(previousInboundVideo?.nackCount, currentInboundVideo?.nackCount),
    firCount: diffNumber(previousInboundVideo?.firCount, currentInboundVideo?.firCount),
    freezeCount: diffNumber(previousInboundVideo?.freezeCount, currentInboundVideo?.freezeCount),
    sampleIntervalMs:
      diffNumber(previousInboundVideo?.timestampMs, currentInboundVideo?.timestampMs) ??
      diffNumber(input.previous?.sampledAtMs, input.current.sampledAtMs),
    candidateBytesReceived: diffNumber(
      input.previous?.selectedCandidatePair?.bytesReceived,
      input.current.selectedCandidatePair?.bytesReceived,
    ),
    candidateBytesSent: diffNumber(
      input.previous?.selectedCandidatePair?.bytesSent,
      input.current.selectedCandidatePair?.bytesSent,
    ),
    ...diffVideoElementSample(input.previousVideoElement, input.currentVideoElement),
  };
  const cleanDelta = dropUndefinedFields(delta) as BrowserRemoteVideoFlowDelta;

  if (!currentInboundVideo) {
    return {
      status: "waiting",
      title: "等待视频 RTP",
      detail: "浏览器尚未从 getStats 看到 inbound-rtp/video。",
      delta: cleanDelta,
      updatedAtMs: input.nowMs,
    };
  }
  if (!previousInboundVideo) {
    return {
      status: "receiving",
      title: "视频 RTP 已开始采样",
      detail: "已看到 inbound-rtp/video，下一次采样会给出增量。",
      delta: cleanDelta,
      updatedAtMs: input.nowMs,
    };
  }
  const videoRtpGrowing = positive(delta.packetsReceived) || positive(delta.bytesReceived);
  const videoElementFramesGrowing = positive(delta.videoElementFrames);

  if (delta.framesDecoded !== undefined) {
    if (positive(delta.framesDecoded)) {
      if (delta.videoElementFrames === 0) {
        return {
          status: "presentation_stalled",
          title: "浏览器已解码，Video 元素呈现帧未增长",
          detail: formatVideoFlowDelta(cleanDelta),
          delta: cleanDelta,
          updatedAtMs: input.nowMs,
        };
      }
      return {
        status: "receiving",
        title: "画面帧在增长",
        detail: formatVideoFlowDelta(cleanDelta),
        delta: cleanDelta,
        updatedAtMs: input.nowMs,
      };
    }
    if (positive(delta.framesReceived) || videoRtpGrowing) {
      return {
        status: "decode_stalled",
        title: "RTP 仍在收包，解码帧未增长",
        detail: formatVideoFlowDelta(cleanDelta),
        delta: cleanDelta,
        updatedAtMs: input.nowMs,
      };
    }
    if (videoElementFramesGrowing) {
      return {
        status: "receiving",
        title: "画面帧在增长",
        detail: formatVideoFlowDelta(cleanDelta),
        delta: cleanDelta,
        updatedAtMs: input.nowMs,
      };
    }
    return {
      status: "transport_stalled",
      title: "RTP 收包无增量",
      detail: formatVideoFlowDelta(cleanDelta),
      delta: cleanDelta,
      updatedAtMs: input.nowMs,
    };
  }
  if (positive(delta.framesReceived) || videoElementFramesGrowing) {
    return {
      status: "receiving",
      title: "画面帧在增长",
      detail: formatVideoFlowDelta(cleanDelta),
      delta: cleanDelta,
      updatedAtMs: input.nowMs,
    };
  }
  if (videoRtpGrowing) {
    if (delta.framesReceived === undefined && delta.videoElementFrames === undefined) {
      return {
        status: "receiving",
        title: "视频 RTP 在增长",
        detail: formatVideoFlowDelta(cleanDelta),
        delta: cleanDelta,
        updatedAtMs: input.nowMs,
      };
    }
    return {
      status: "decode_stalled",
      title: "RTP 仍在收包，解码帧未增长",
      detail: formatVideoFlowDelta(cleanDelta),
      delta: cleanDelta,
      updatedAtMs: input.nowMs,
    };
  }
  return {
    status: "transport_stalled",
    title: "RTP 收包无增量",
    detail: formatVideoFlowDelta(cleanDelta),
    delta: cleanDelta,
    updatedAtMs: input.nowMs,
  };
}

function isSameInboundVideo(
  previous: BrowserRemoteInboundVideoStats | undefined,
  current: BrowserRemoteInboundVideoStats | undefined,
): boolean {
  if (!previous || !current) return false;
  if (previous.id !== undefined && current.id !== undefined && previous.id !== current.id) return false;
  if (
    previous.trackIdentifier !== undefined &&
    current.trackIdentifier !== undefined &&
    previous.trackIdentifier !== current.trackIdentifier
  ) {
    return false;
  }
  return previous.ssrc === undefined || current.ssrc === undefined || previous.ssrc === current.ssrc;
}

export function diffVideoElementSample(
  previous: BrowserRemoteVideoElementSample | undefined,
  current: BrowserRemoteVideoElementSample | undefined,
): Pick<BrowserRemoteVideoFlowDelta, "presentedFrames" | "videoElementFrames" | "videoElementTimeMs"> {
  const samplesUseDifferentTracks =
    previous?.trackIdentifier !== undefined &&
    current?.trackIdentifier !== undefined &&
    previous.trackIdentifier !== current.trackIdentifier;
  if (!previous || !current || previous === current || samplesUseDifferentTracks) return {};
  const presentedFrames = diffNumber(previous.presentedFrames, current.presentedFrames);
  const videoElementFrames =
    presentedFrames !== undefined
      ? presentedFrames
      : previous.totalVideoFrames !== undefined && current.totalVideoFrames !== undefined
        ? diffNumber(previous.totalVideoFrames, current.totalVideoFrames)
        : undefined;
  return {
    presentedFrames,
    videoElementFrames,
    videoElementTimeMs: diffNumber(previous.currentTimeMs, current.currentTimeMs),
  };
}

export function isActiveVideoElementSample(sample: BrowserRemoteVideoElementSample | undefined): boolean {
  if (!sample) return false;
  return (
    positive(sample.width) ||
    positive(sample.height) ||
    positive(sample.presentedFrames) ||
    positive(sample.totalVideoFrames) ||
    positive(sample.currentTimeMs) ||
    (sample.readyState !== undefined && sample.readyState >= 2)
  );
}

export function positive(value: number | undefined): boolean {
  return value !== undefined && value > 0;
}

export function formatVideoFlowDelta(delta: BrowserRemoteVideoFlowDelta): string {
  return (
    [
      delta.framesDecoded === undefined ? null : `decoded +${delta.framesDecoded}`,
      delta.framesReceived === undefined ? null : `received +${delta.framesReceived}`,
      delta.keyFramesDecoded === undefined || delta.keyFramesDecoded === 0 ? null : `key +${delta.keyFramesDecoded}`,
      delta.framesDropped === undefined || delta.framesDropped === 0 ? null : `dropped +${delta.framesDropped}`,
      delta.packetsReceived === undefined ? null : `pkt +${delta.packetsReceived}`,
      delta.bytesReceived === undefined ? null : `bytes +${delta.bytesReceived}`,
      delta.pliCount === undefined || delta.pliCount === 0 ? null : `pli +${delta.pliCount}`,
      delta.nackCount === undefined || delta.nackCount === 0 ? null : `nack +${delta.nackCount}`,
      delta.firCount === undefined || delta.firCount === 0 ? null : `fir +${delta.firCount}`,
      delta.freezeCount === undefined || delta.freezeCount === 0 ? null : `freeze +${delta.freezeCount}`,
      delta.sampleIntervalMs === undefined ? null : `interval ${Math.round(delta.sampleIntervalMs)}ms`,
      delta.presentedFrames === undefined ? null : `presented +${delta.presentedFrames}`,
      delta.videoElementFrames === undefined || delta.presentedFrames !== undefined
        ? null
        : `video +${delta.videoElementFrames}`,
    ]
      .filter(Boolean)
      .join(" · ") || "本次采样没有可比较增量"
  );
}

export function readSelectedCandidatePair(report: BrowserRemoteStatsReport): {
  connectionPath: StreamerConnectionPath;
  pair?: BrowserRemoteSelectedCandidatePair;
} {
  const entries = collectStatsEntries(report);
  const pairRecord = [...entries.values()].find(isSelectedCandidatePair);
  if (!pairRecord) return { connectionPath: "unknown" };

  const local = entries.get(stringValue(pairRecord.localCandidateId)) ?? {};
  const remote = entries.get(stringValue(pairRecord.remoteCandidateId)) ?? {};
  const pair: BrowserRemoteSelectedCandidatePair = {};
  assignString(pair, "localCandidateType", local.candidateType ?? pairRecord.localCandidateType);
  assignString(pair, "remoteCandidateType", remote.candidateType ?? pairRecord.remoteCandidateType);
  assignString(pair, "localAddress", local.address ?? local.ip ?? local.ipAddress);
  assignString(pair, "remoteAddress", remote.address ?? remote.ip ?? remote.ipAddress);
  assignString(pair, "protocol", local.protocol ?? pairRecord.protocol);
  assignOptionalNumber(pair, "bytesReceived", pairRecord.bytesReceived);
  assignOptionalNumber(pair, "bytesSent", pairRecord.bytesSent);
  assignOptionalNumber(pair, "currentRoundTripTime", pairRecord.currentRoundTripTime);
  assignOptionalNumber(pair, "availableIncomingBitrate", pairRecord.availableIncomingBitrate);
  assignOptionalNumber(pair, "availableOutgoingBitrate", pairRecord.availableOutgoingBitrate);

  const candidateType =
    pair.localCandidateType === "relay" || pair.remoteCandidateType === "relay"
      ? "relay"
      : (pair.localCandidateType ?? pair.remoteCandidateType);
  return {
    connectionPath: classifyStreamerConnectionPath({
      candidateType,
      isLanConnection: isPrivateHostCandidatePair(pair),
    }),
    pair,
  };
}

export function readInboundVideoStats(
  report: BrowserRemoteStatsReport,
  preferredTrackIdentifier?: string,
): BrowserRemoteInboundVideoStats | undefined {
  const entries = collectStatsEntries(report);
  const videoRecords = [...entries.values()].filter(
    (entry) => entry.type === "inbound-rtp" && (entry.kind === "video" || entry.mediaType === "video"),
  );
  const preferredRecord = preferredTrackIdentifier
    ? videoRecords.find((entry) => entry.trackIdentifier === preferredTrackIdentifier)
    : undefined;
  const record =
    preferredRecord ??
    videoRecords.sort((left, right) => numberValue(right.framesDecoded) - numberValue(left.framesDecoded))[0];
  if (!record) return undefined;

  const stats: BrowserRemoteInboundVideoStats = {};
  assignString(stats, "id", record.id);
  assignString(stats, "codecId", record.codecId);
  assignString(stats, "mid", record.mid);
  assignString(stats, "trackIdentifier", record.trackIdentifier);
  assignOptionalNumber(stats, "ssrc", record.ssrc);
  for (const key of [
    "packetsReceived",
    "packetsLost",
    "bytesReceived",
    "framesDecoded",
    "framesReceived",
    "framesDropped",
    "keyFramesDecoded",
    "freezeCount",
    "totalFreezesDuration",
    "pauseCount",
    "totalPausesDuration",
    "jitterBufferDelay",
    "jitterBufferEmittedCount",
    "nackCount",
    "pliCount",
    "firCount",
    "frameWidth",
    "frameHeight",
    "framesPerSecond",
    "framesAssembledFromMultiplePackets",
    "totalAssemblyTime",
  ] as const) {
    assignOptionalNumber(stats, key, record[key]);
  }
  assignOptionalNumber(stats, "timestampMs", record.timestamp);
  assignString(stats, "decoderImplementation", record.decoderImplementation);
  assignBoolean(stats, "powerEfficientDecoder", record.powerEfficientDecoder);
  const codec = entries.get(stringValue(record.codecId));
  if (codec) {
    assignString(stats, "codecMimeType", codec.mimeType);
    assignOptionalNumber(stats, "codecPayloadType", codec.payloadType);
  }
  return Object.keys(stats).length > 0 ? stats : undefined;
}

export function readInboundAudioStats(report: BrowserRemoteStatsReport): BrowserRemoteInboundAudioStats | undefined {
  const entries = collectStatsEntries(report);
  const record = [...entries.values()]
    .filter((entry) => entry.type === "inbound-rtp" && (entry.kind === "audio" || entry.mediaType === "audio"))
    .sort((left, right) => numberValue(right.bytesReceived) - numberValue(left.bytesReceived))[0];
  if (!record) return undefined;

  const stats: BrowserRemoteInboundAudioStats = {};
  assignString(stats, "codecId", record.codecId);
  for (const key of [
    "packetsReceived",
    "packetsLost",
    "bytesReceived",
    "jitter",
    "jitterBufferDelay",
    "jitterBufferEmittedCount",
    "totalSamplesReceived",
    "concealedSamples",
    "silentConcealedSamples",
    "totalAudioEnergy",
    "audioLevel",
  ] as const) {
    assignOptionalNumber(stats, key, record[key]);
  }
  assignOptionalNumber(stats, "timestampMs", record.timestamp);
  const codec = entries.get(stringValue(record.codecId));
  if (codec) {
    assignString(stats, "codecMimeType", codec.mimeType);
    assignOptionalNumber(stats, "codecPayloadType", codec.payloadType);
    assignOptionalNumber(stats, "codecClockRate", codec.clockRate);
    assignOptionalNumber(stats, "codecChannels", codec.channels);
  }
  return Object.keys(stats).length > 0 ? stats : undefined;
}

function collectStatsEntries(report: BrowserRemoteStatsReport): Map<string, Record<string, unknown>> {
  const entries = new Map<string, Record<string, unknown>>();
  report.forEach((value, key) => {
    const record = asRecord(value);
    if (record) entries.set(key, record);
  });
  return entries;
}

function diffNumber(previous: number | undefined, current: number | undefined): number | undefined {
  if (previous === undefined || current === undefined) return undefined;
  return current - previous;
}

function isSelectedCandidatePair(record: Record<string, unknown>): boolean {
  if (record.type !== "candidate-pair") return false;
  if (record.selected === true) return true;
  if (record.nominated === true && record.state === "succeeded") return true;
  return record.state === "succeeded" && typeof record.localCandidateId === "string";
}

function isPrivateHostCandidatePair(pair: BrowserRemoteSelectedCandidatePair): boolean {
  return (
    pair.localCandidateType === "host" &&
    pair.remoteCandidateType === "host" &&
    isPrivateAddress(pair.localAddress) &&
    isPrivateAddress(pair.remoteAddress)
  );
}

function isPrivateAddress(value: string | undefined): boolean {
  if (!value) return false;
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1, 3).map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return a === 169 && b === 254;
  }
  const normalized = value.toLowerCase();
  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function assignString<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  if (typeof value === "string" && value.length > 0) target[key] = value as T[K];
}

function assignBoolean<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  if (typeof value === "boolean") target[key] = value as T[K];
}

function assignOptionalNumber<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) target[key] = value as T[K];
}
