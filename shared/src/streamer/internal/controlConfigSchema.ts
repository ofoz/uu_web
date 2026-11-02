import { STREAMER_CHROMA_FORMATS, STREAMER_VIDEO_CODECS } from "./connectOptionsSchema.js";

export const STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS = ["control_id", "device_capability"] as const;
export const STREAMER_DEVICE_CAPABILITY_JSON_KEYS = ["display_info", "video_codec_capability", "ice_id"] as const;
export const STREAMER_DISPLAY_INFO_KEYS = ["id", "fps", "type", "hdr"] as const;
export const STREAMER_VIDEO_CODEC_CAPABILITY_KEYS = [
  "video_codec",
  "width",
  "height",
  "chroma_sampling",
  "bit_depth",
  "codec_impl",
] as const;

export interface StreamerDeviceCapability {
  display_info: Array<{ id: number; fps: number; type: number; hdr: number }>;
  video_codec_capability: Array<{
    video_codec: number;
    width: number;
    height: number;
    chroma_sampling: number;
    bit_depth: number;
    codec_impl: number;
  }>;
  ice_id: string;
}

export const STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY: StreamerDeviceCapability = {
  display_info: [{ id: 0, fps: 60, type: 0, hdr: -1 }],
  video_codec_capability: [
    {
      video_codec: STREAMER_VIDEO_CODECS.H264,
      width: 3840,
      height: 2160,
      chroma_sampling: STREAMER_CHROMA_FORMATS.ChromaFormat_420,
      bit_depth: 8,
      codec_impl: -1,
    },
  ],
  ice_id: "",
};

export function buildStreamerBrowserDeviceCapability(): StreamerDeviceCapability {
  return {
    display_info: STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY.display_info.map((item) => ({ ...item })),
    video_codec_capability: STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY.video_codec_capability.map((item) => ({
      ...item,
    })),
    ice_id: STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY.ice_id,
  };
}
