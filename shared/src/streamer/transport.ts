export const STREAMER_DATA_CHANNEL_LABELS = {
  control: "CONTROL_DATA_CHANNEL",
  text: "TEXT_DATA_CHANNEL",
  streamer: "STREAMER_DATA_CHANNEL",
  file: "FILE_DATA_CHANNEL",
  binary: "BINARY_DATA_CHANNEL",
} as const;

export type StreamerDataChannelKind = keyof typeof STREAMER_DATA_CHANNEL_LABELS;
export type StreamerDataChannelLabel = (typeof STREAMER_DATA_CHANNEL_LABELS)[StreamerDataChannelKind];

export const STREAMER_MAX_DATA_BUFFER_BYTES = 0x80000;

export type StreamerConnectionPath = "lan" | "p2p" | "relay" | "unknown";

export interface StreamerStatsPathInput {
  candidateType?: string | null;
  isLanConnection?: boolean | null;
}

const knownDataChannelLabels = new Set<string>(Object.values(STREAMER_DATA_CHANNEL_LABELS));

export function isStreamerDataChannelLabel(value: string): value is StreamerDataChannelLabel {
  return knownDataChannelLabels.has(value);
}

export function classifyStreamerConnectionPath(input: StreamerStatsPathInput): StreamerConnectionPath {
  if (input.isLanConnection === true) return "lan";

  const candidateType = input.candidateType?.trim().toLowerCase();
  if (!candidateType) return "unknown";
  if (candidateType === "relay") return "relay";
  return "p2p";
}
