import { describe, expect, it } from "vitest";

import { isDesktopRemoteScrollTarget, RemoteScrollDeltaAccumulator } from "../src/remote/remoteScrollInput.js";

describe("RemoteScrollDeltaAccumulator", () => {
  it("converts browser content scrolling and reduces the desktop scroll speed", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();

    expect(accumulator.push({ deltaX: 0, deltaY: 12, deltaMode: 0, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 0,
      deltaY: -6,
    });
    expect(accumulator.push({ deltaX: 0, deltaY: -8, deltaMode: 0, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 0,
      deltaY: 4,
    });
  });

  it("keeps the existing direction for non-desktop targets", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();

    expect(accumulator.push({ deltaX: 1, deltaY: 5, deltaMode: 0, pageHeight: 800, desktopTarget: false })).toEqual({
      deltaX: 1,
      deltaY: 5,
    });
  });

  it("normalizes line and page deltas to pixels", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();

    expect(accumulator.push({ deltaX: 1, deltaY: 1, deltaMode: 1, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 9,
      deltaY: -9,
    });
    expect(accumulator.push({ deltaX: 0, deltaY: 1, deltaMode: 2, pageHeight: 640, desktopTarget: true })).toEqual({
      deltaX: 0,
      deltaY: -320,
    });
  });

  it("filters clear cross-axis trackpad noise without blocking diagonal scrolling", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();

    expect(accumulator.push({ deltaX: 1, deltaY: 10, deltaMode: 0, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 0,
      deltaY: -5,
    });
    expect(accumulator.push({ deltaX: 10, deltaY: 1, deltaMode: 0, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 5,
      deltaY: 0,
    });
    expect(accumulator.push({ deltaX: 6, deltaY: 8, deltaMode: 0, pageHeight: 800, desktopTarget: true })).toEqual({
      deltaX: 3,
      deltaY: -4,
    });
  });

  it("accumulates fractional pixel deltas before emitting integers", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();
    const input = { deltaX: 0, deltaY: 0.5, deltaMode: 0, pageHeight: 800, desktopTarget: true };

    expect(accumulator.push(input)).toBeUndefined();
    expect(accumulator.push(input)).toBeUndefined();
    expect(accumulator.push(input)).toBeUndefined();
    expect(accumulator.push(input)).toEqual({ deltaX: 0, deltaY: -1 });

    accumulator.reset();
    expect(accumulator.push(input)).toBeUndefined();
  });

  it("ignores non-finite browser deltas", () => {
    const accumulator = new RemoteScrollDeltaAccumulator();

    expect(
      accumulator.push({
        deltaX: Number.NaN,
        deltaY: Number.POSITIVE_INFINITY,
        deltaMode: 0,
        pageHeight: 800,
        desktopTarget: true,
      }),
    ).toBeUndefined();
  });
});

describe("isDesktopRemoteScrollTarget", () => {
  it("limits the direction conversion to confirmed desktop targets", () => {
    expect(isDesktopRemoteScrollTarget(1)).toBe(true);
    expect(isDesktopRemoteScrollTarget(4)).toBe(true);
    expect(isDesktopRemoteScrollTarget(2)).toBe(false);
    expect(isDesktopRemoteScrollTarget(undefined)).toBe(false);
  });
});
