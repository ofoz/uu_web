import { describe, expect, it } from "vitest";

import type { RemoteVideoStream } from "../src/app/remoteControlTypes.js";
import { resolvePrimaryRemoteVideoId } from "../src/remote/remoteVideoModel.js";

describe("remoteVideoModel", () => {
  it("moves away from a selected video after its track ends", () => {
    const videos = [
      { id: "old-track", stream: {} as MediaStream },
      { id: "live-track", stream: {} as MediaStream },
    ] satisfies RemoteVideoStream[];

    expect(
      resolvePrimaryRemoteVideoId(
        videos,
        {
          "old-track": {
            event: "ended",
            currentTimeMs: 9000,
            totalVideoFrames: 500,
            ended: true,
          },
          "live-track": {
            event: "playing",
            currentTimeMs: 1000,
            totalVideoFrames: 60,
            ended: false,
          },
        },
        "old-track",
      ),
    ).toBe("live-track");
  });
});
