import { describe, expect, it } from "vitest";

import {
  STREAMER_DATA_CHANNEL_LABELS,
  STREAMER_MAX_DATA_BUFFER_BYTES,
  classifyStreamerConnectionPath,
  isStreamerDataChannelLabel,
} from "../src/streamer/transport.js";

describe("streamer transport", () => {
  it("validates known channel labels and the binary send size limit", () => {
    expect(Object.values(STREAMER_DATA_CHANNEL_LABELS)).toEqual([
      "CONTROL_DATA_CHANNEL",
      "TEXT_DATA_CHANNEL",
      "STREAMER_DATA_CHANNEL",
      "FILE_DATA_CHANNEL",
      "BINARY_DATA_CHANNEL",
    ]);
    expect(isStreamerDataChannelLabel("CONTROL_DATA_CHANNEL")).toBe(true);
    expect(isStreamerDataChannelLabel("UNKNOWN_CHANNEL")).toBe(false);
    expect(STREAMER_MAX_DATA_BUFFER_BYTES).toBe(512 * 1024);
  });

  it("prioritizes LAN over candidate type", () => {
    expect(classifyStreamerConnectionPath({ candidateType: "relay", isLanConnection: true })).toBe("lan");
  });

  it("classifies relay and direct candidate paths", () => {
    expect(classifyStreamerConnectionPath({ candidateType: "relay" })).toBe("relay");
    expect(classifyStreamerConnectionPath({ candidateType: "host" })).toBe("p2p");
    expect(classifyStreamerConnectionPath({ candidateType: "srflx" })).toBe("p2p");
    expect(classifyStreamerConnectionPath({ candidateType: "prflx" })).toBe("p2p");
  });

  it("returns unknown when session stats have not arrived", () => {
    expect(classifyStreamerConnectionPath({})).toBe("unknown");
  });
});
