import { describe, expect, it } from "vitest";

import { STREAMER_VIDEO_CODECS } from "../src/streamer/internal/connectOptionsSchema.js";
import {
  STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS,
  STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY,
  STREAMER_DEVICE_CAPABILITY_JSON_KEYS,
  STREAMER_DISPLAY_INFO_KEYS,
  STREAMER_VIDEO_CODEC_CAPABILITY_KEYS,
  buildStreamerBrowserDeviceCapability,
} from "../src/streamer/internal/controlConfigSchema.js";
import { buildStreamerControlStreamerDataJson } from "../src/streamer/controlConfig.js";

describe("streamer control config", () => {
  it("builds the StreamerControlConfig JSON carried by control streamer_data", () => {
    expect(STREAMER_VIDEO_CODECS).toEqual({
      Unknown: 0,
      H264: 1,
      H265: 2,
      VP8: 3,
      VP9: 4,
      AV1: 5,
    });
    expect(STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS).toEqual(["control_id", "device_capability"]);
    expect(STREAMER_DEVICE_CAPABILITY_JSON_KEYS).toEqual(["display_info", "video_codec_capability", "ice_id"]);
    expect(STREAMER_VIDEO_CODEC_CAPABILITY_KEYS).toEqual([
      "video_codec",
      "width",
      "height",
      "chroma_sampling",
      "bit_depth",
      "codec_impl",
    ]);
    expect(buildStreamerBrowserDeviceCapability()).toEqual(STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY);

    const streamerData = JSON.parse(buildStreamerControlStreamerDataJson({ controlId: "control-1" }));
    expect(Object.keys(streamerData)).toEqual(STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS);
    expect(Object.keys(streamerData.device_capability)).toEqual(STREAMER_DEVICE_CAPABILITY_JSON_KEYS);
    expect(Object.keys(streamerData.device_capability.display_info[0])).toEqual(STREAMER_DISPLAY_INFO_KEYS);
    expect(Object.keys(streamerData.device_capability.video_codec_capability[0])).toEqual(
      STREAMER_VIDEO_CODEC_CAPABILITY_KEYS,
    );
    expect(streamerData).toEqual({
      control_id: "control-1",
      device_capability: {
        display_info: [
          {
            id: 0,
            fps: 60,
            type: 0,
            hdr: -1,
          },
        ],
        video_codec_capability: [
          {
            video_codec: STREAMER_VIDEO_CODECS.H264,
            width: 3840,
            height: 2160,
            chroma_sampling: 1,
            bit_depth: 8,
            codec_impl: -1,
          },
        ],
        ice_id: "",
      },
    });
    expect(buildStreamerControlStreamerDataJson({ controlId: "control-1", iceId: "ice-1" })).toContain(
      '"ice_id":"ice-1"',
    );
    expect(
      buildStreamerControlStreamerDataJson({
        controlId: "control-1",
        deviceCapability: {
          video_codec_capability: [{ video_codec: STREAMER_VIDEO_CODECS.VP8 }],
        },
      }),
    ).toBe('{"control_id":"control-1","device_capability":{"video_codec_capability":[{"video_codec":3}]}}');
  });
});
