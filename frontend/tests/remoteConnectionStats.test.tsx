// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RemoteConnectionQuality } from "../src/app/remoteControlTypes.js";
import { RemoteControlConnectionStats } from "../src/components/RemoteControlConnectionStats.js";
import { formatConnectionDuration } from "../src/remote/connectionStats.js";

function buildQuality(
  state: RemoteConnectionQuality["state"],
  title: string,
  latency: string,
  fps: string,
): RemoteConnectionQuality {
  return {
    state,
    title,
    detail: "",
    metrics: [
      { label: "延迟", value: latency },
      { label: "帧率", value: fps },
    ],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("formatConnectionDuration", () => {
  it("formats sessions under an hour as mm:ss", () => {
    expect(formatConnectionDuration(0)).toBe("00:00");
    expect(formatConnectionDuration(65_000)).toBe("01:05");
    expect(formatConnectionDuration(59 * 60_000 + 59_000)).toBe("59:59");
  });

  it("formats long sessions as h:mm:ss", () => {
    expect(formatConnectionDuration(3_600_000)).toBe("1:00:00");
    expect(formatConnectionDuration(3_600_000 + 61_000)).toBe("1:01:01");
  });

  it("clamps invalid input to zero", () => {
    expect(formatConnectionDuration(-5_000)).toBe("00:00");
    expect(formatConnectionDuration(Number.NaN)).toBe("00:00");
  });
});

describe("RemoteControlConnectionStats", () => {
  it("shows duration, latency and fps, and keeps the duration ticking", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 2, 16, 0, 0));
    const connectedAtMs = Date.now() - 65_000;

    render(
      <RemoteControlConnectionStats
        connectedAtMs={connectedAtMs}
        connectionQuality={buildQuality("good", "连接正常", "32 ms", "28 fps")}
      />,
    );

    expect(screen.getByText("01:05")).toBeTruthy();
    expect(screen.getByText("32 ms")).toBeTruthy();
    expect(screen.getByText("28 fps")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(4_000);
    });

    expect(screen.getByText("01:09")).toBeTruthy();
  });

  it("uses placeholders before the first stats sample arrives", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 2, 16, 0, 0));

    render(
      <RemoteControlConnectionStats
        connectedAtMs={Date.now()}
        connectionQuality={buildQuality("pending", "等待质量采样", "采样中", "采样中")}
      />,
    );

    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("00:00")).toBeTruthy();
  });

  it("surfaces a degraded quality banner next to the metrics", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 2, 16, 0, 0));

    render(
      <RemoteControlConnectionStats
        connectedAtMs={Date.now()}
        connectionQuality={buildQuality("warn", "画面卡顿", "180 ms", "8 fps")}
      />,
    );

    expect(screen.getByText("画面卡顿")).toBeTruthy();
  });
});
