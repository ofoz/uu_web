import { describe, expect, it } from "vitest";

import { readInboundVideoStats } from "../src/remote/browserRemote/diagnostics.js";

describe("readInboundVideoStats", () => {
  it("selects the most active video stream when no preferred track identifier is available", () => {
    const report = createReport([
      {
        id: "inbound-low",
        type: "inbound-rtp",
        kind: "video",
        framesDecoded: 12,
      },
      {
        id: "inbound-high",
        type: "inbound-rtp",
        kind: "video",
        framesDecoded: 240,
      },
    ]);

    expect(readInboundVideoStats(report)).toMatchObject({
      id: "inbound-high",
      framesDecoded: 240,
    });
  });

  it("selects the preferred video track before comparing decoded frame counts", () => {
    const report = createReport([
      {
        id: "inbound-preferred",
        type: "inbound-rtp",
        kind: "video",
        trackIdentifier: "track-primary",
        framesDecoded: 12,
      },
      {
        id: "inbound-other",
        type: "inbound-rtp",
        kind: "video",
        trackIdentifier: "track-secondary",
        framesDecoded: 240,
      },
    ]);

    expect(readInboundVideoStats(report, "track-primary")).toMatchObject({
      id: "inbound-preferred",
      trackIdentifier: "track-primary",
      framesDecoded: 12,
    });
  });
});

function createReport(entries: Array<Record<string, unknown>>): Map<string, Record<string, unknown>> {
  return new Map(entries.map((entry) => [String(entry.id), entry]));
}
