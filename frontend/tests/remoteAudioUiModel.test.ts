import { describe, expect, it } from "vitest";

import { formatAudioElement, formatInboundAudioStats } from "../src/remote/remoteSessionUiModel.js";

describe("remote audio diagnostics", () => {
  it("formats inbound Opus transport and jitter-buffer stats", () => {
    expect(
      formatInboundAudioStats({
        codecMimeType: "audio/opus",
        codecClockRate: 48000,
        codecChannels: 2,
        packetsReceived: 240,
        packetsLost: 3,
        bytesReceived: 65536,
        jitter: 0.0124,
        jitterBufferDelay: 1.2,
        jitterBufferEmittedCount: 120,
        totalSamplesReceived: 230400,
        concealedSamples: 960,
      }),
    ).toBe(
      "audio/opus · 48000Hz/2ch · pkt=240 · lost=3 · bytes=65536 · jitter=12ms · buffer=10ms · samples=230400 · concealed=960",
    );
  });

  it("includes autoplay failures in the audio element summary", () => {
    expect(
      formatAudioElement({
        event: "autoplay_blocked",
        currentTimeMs: 0,
        readyState: 1,
        paused: true,
        muted: false,
        volume: 1,
        autoplayBlocked: true,
        errorName: "NotAllowedError",
      }),
    ).toBe(
      "autoplay_blocked · 0ms · ready=1 · paused=true · muted=false · volume=100% · autoplay=blocked · error=NotAllowedError",
    );
  });
});
