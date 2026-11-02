import {
  STREAMER_APP_CLIENT_VERSION,
  STREAMER_CAPTURE_TYPES,
  STREAMER_CHOOSE_RESOLUTION_TYPES,
  STREAMER_CHROMA_FORMATS,
  STREAMER_DECODER_CHROMA_FORMATS,
  STREAMER_DECODER_CODEC_TYPES,
  STREAMER_DEFAULT_FEATURE_FLAGS,
  STREAMER_FEATURE_FLAG_FIELDS,
  STREAMER_FPS_VALUES,
  STREAMER_VIDEO_QUALITY_VALUES,
} from "./connectOptionsSchema.js";
import {
  STREAMER_CLIENT_TYPES,
  STREAMER_CONTROL_CONNECT_TYPES,
  type StreamerScreenResolutionInput,
  type StreamerVirtualDisplayModeInput,
} from "../connectOptionsModel.js";
import { pushInt32Field, pushMessageField, pushStringField, pushVarintField } from "./protobufWire.js";

export interface EncodeStreamerCaptureParamsInput {
  fps?: number;
  videoQuality?: number;
  cursorCapture?: boolean;
  chooseResolutionType?: number;
  localResolution?: StreamerScreenResolutionInput | null;
  chooseResolution?: StreamerScreenResolutionInput | null;
  chromaFormat?: number;
  maxCustomBitrate?: number;
  enableHdr?: boolean;
  autoFrameQuality?: number;
  fpsCount?: number;
}

export interface EncodeStreamerDecoderCapInput {
  fps?: number;
  codecType?: number;
  width?: number;
  height?: number;
  chromaFormat?: number;
}

export type StreamerFeatureFlagsInput = Partial<Record<(typeof STREAMER_FEATURE_FLAG_FIELDS)[number]["name"], number>>;

export interface EncodeStreamerConnectOptionsInput {
  captureType?: number;
  typeValue?: number;
  captureParams?: EncodeStreamerCaptureParamsInput | null;
  decoderCapList?: readonly Uint8Array[];
  forceVirtualDisplay?: boolean;
  virtualDisplayModes?: readonly StreamerVirtualDisplayModeInput[];
  virtualDisplayInitResolution?: StreamerScreenResolutionInput | null;
  clientType?: number;
  deviceId: string;
  controlConnectType?: number;
  featureFlags?: StreamerFeatureFlagsInput | null;
  clientVersion?: string;
}

export function encodeStreamerConnectOptions(input: EncodeStreamerConnectOptionsInput): Uint8Array {
  const bytes: number[] = [];
  const captureType = input.captureType ?? STREAMER_CAPTURE_TYPES.CT_DESKTOP;
  const typeValue = input.typeValue ?? 0;
  const clientType = input.clientType ?? STREAMER_CLIENT_TYPES.Client_ANDROID;
  const controlConnectType = input.controlConnectType ?? STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Normal;
  const clientVersion = input.clientVersion ?? STREAMER_APP_CLIENT_VERSION;

  if (captureType !== STREAMER_CAPTURE_TYPES.CT_UNKNOWN) pushVarintField(bytes, 1, captureType);
  if (typeValue !== 0) pushInt32Field(bytes, 2, typeValue);
  const captureParams =
    input.captureParams === null ? new Uint8Array() : encodeStreamerCaptureParams(input.captureParams ?? {});
  if (captureParams.length > 0) pushMessageField(bytes, 3, captureParams);
  for (const decoderCap of input.decoderCapList ?? []) pushMessageField(bytes, 4, decoderCap);
  if (input.forceVirtualDisplay) pushVarintField(bytes, 5, 1);
  for (const mode of input.virtualDisplayModes ?? []) pushMessageField(bytes, 6, encodeVirtualDisplayMode(mode));
  if (input.virtualDisplayInitResolution)
    pushMessageField(bytes, 7, encodeResolution(input.virtualDisplayInitResolution));
  if (clientType !== STREAMER_CLIENT_TYPES.Client_UNSPECIFIED) pushVarintField(bytes, 8, clientType);
  if (input.deviceId.length > 0) pushStringField(bytes, 9, input.deviceId);
  if (controlConnectType !== STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_UNKNOWN)
    pushVarintField(bytes, 10, controlConnectType);
  const featureFlags = encodeFeatureFlags(input.featureFlags ?? STREAMER_DEFAULT_FEATURE_FLAGS);
  if (featureFlags.length > 0) pushMessageField(bytes, 11, featureFlags);
  if (clientVersion.length > 0) pushStringField(bytes, 12, clientVersion);
  return new Uint8Array(bytes);
}

export function buildDefaultStreamerDecoderCap(): Uint8Array {
  return encodeStreamerDecoderCap({
    fps: 60,
    codecType: STREAMER_DECODER_CODEC_TYPES.CodecType_H264,
    width: 3840,
    height: 2160,
    chromaFormat: STREAMER_DECODER_CHROMA_FORMATS.ChromaFormat_420,
  });
}

export function encodeStreamerDecoderCap(input: EncodeStreamerDecoderCapInput): Uint8Array {
  const bytes: number[] = [];
  if (input.fps) pushInt32Field(bytes, 1, input.fps);
  const codecType = input.codecType ?? STREAMER_DECODER_CODEC_TYPES.CodecType_UNKNOWN;
  if (codecType !== STREAMER_DECODER_CODEC_TYPES.CodecType_UNKNOWN) pushVarintField(bytes, 2, codecType);
  if (input.width) pushInt32Field(bytes, 3, input.width);
  if (input.height) pushInt32Field(bytes, 4, input.height);
  const chromaFormat = input.chromaFormat ?? STREAMER_DECODER_CHROMA_FORMATS.ChromaFormat_UNKNOWN;
  if (chromaFormat !== STREAMER_DECODER_CHROMA_FORMATS.ChromaFormat_UNKNOWN) pushVarintField(bytes, 5, chromaFormat);
  return new Uint8Array(bytes);
}

export function encodeBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    output += alphabet[a >> 2];
    output += alphabet[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    output += b === undefined ? "=" : alphabet[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    output += c === undefined ? "=" : alphabet[c & 0x3f];
  }
  return output;
}

function encodeStreamerCaptureParams(input: EncodeStreamerCaptureParamsInput): Uint8Array {
  const bytes: number[] = [];
  if (input.fps && input.fps !== STREAMER_FPS_VALUES.FPS_UNKNOWN) pushVarintField(bytes, 1, input.fps);
  if (input.videoQuality && input.videoQuality !== STREAMER_VIDEO_QUALITY_VALUES.VideoQuality_UNKNOWN)
    pushVarintField(bytes, 2, input.videoQuality);
  if (input.cursorCapture) pushVarintField(bytes, 3, 1);
  if (input.chooseResolutionType && input.chooseResolutionType !== STREAMER_CHOOSE_RESOLUTION_TYPES.ChooseType_UNKNOWN)
    pushVarintField(bytes, 4, input.chooseResolutionType);
  if (input.localResolution) pushMessageField(bytes, 5, encodeResolution(input.localResolution));
  if (input.chooseResolution) pushMessageField(bytes, 6, encodeResolution(input.chooseResolution));
  if (input.chromaFormat && input.chromaFormat !== STREAMER_CHROMA_FORMATS.ChromaFormat_UNKNOWN)
    pushVarintField(bytes, 7, input.chromaFormat);
  if (input.maxCustomBitrate) pushInt32Field(bytes, 8, input.maxCustomBitrate);
  if (input.enableHdr) pushVarintField(bytes, 9, 1);
  if (input.autoFrameQuality && input.autoFrameQuality !== STREAMER_VIDEO_QUALITY_VALUES.VideoQuality_UNKNOWN)
    pushVarintField(bytes, 10, input.autoFrameQuality);
  if (input.fpsCount) pushInt32Field(bytes, 11, input.fpsCount);
  return new Uint8Array(bytes);
}

function encodeResolution(input: StreamerScreenResolutionInput): Uint8Array {
  const bytes: number[] = [];
  if (input.width) pushInt32Field(bytes, 1, input.width);
  if (input.height) pushInt32Field(bytes, 2, input.height);
  return new Uint8Array(bytes);
}

function encodeVirtualDisplayMode(input: StreamerVirtualDisplayModeInput): Uint8Array {
  const bytes = Array.from(encodeResolution(input));
  if (input.fps) pushInt32Field(bytes, 3, input.fps);
  return new Uint8Array(bytes);
}

function encodeFeatureFlags(input: StreamerFeatureFlagsInput): Uint8Array {
  const bytes: number[] = [];
  for (const field of STREAMER_FEATURE_FLAG_FIELDS) {
    const value = input[field.name] ?? 0;
    if (value) pushInt32Field(bytes, field.tag, value);
  }
  return new Uint8Array(bytes);
}
