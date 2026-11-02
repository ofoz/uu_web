import { describe, expect, it } from "vitest";

import { clientPointToRemoteMedia, computeRemoteMediaGeometry } from "../src/remote/remoteMediaGeometry.js";

describe("remote media geometry", () => {
  it("centers a contained image and maps client coordinates", () => {
    const geometry = computeRemoteMediaGeometry({
      containerRect: { left: 100, top: 50, width: 1000, height: 500 },
      mediaWidth: 1600,
      mediaHeight: 1200,
      objectFit: "contain",
    });

    expect(geometry).toBeDefined();
    expect(geometry!.displayRect.left).toBeCloseTo(266.6667);
    expect(geometry!.displayRect.top).toBe(50);
    expect(geometry!.displayRect.width).toBeCloseTo(666.6667);
    expect(geometry!.displayRect.height).toBe(500);
    expect(geometry!.visibleRect).toEqual(geometry!.displayRect);
    expect(clientPointToRemoteMedia(geometry!, { x: 600, y: 300 })).toEqual({
      x: 0.5,
      y: 0.5,
      insideVisibleMedia: true,
    });
  });

  it("reports contain letterbox points outside the visible media and clamps them", () => {
    const geometry = computeRemoteMediaGeometry({
      containerRect: { left: 0, top: 0, width: 800, height: 600 },
      mediaWidth: 1600,
      mediaHeight: 900,
      objectFit: "contain",
    })!;

    expect(geometry.displayRect).toEqual({ left: 0, top: 75, width: 800, height: 450 });
    expect(clientPointToRemoteMedia(geometry, { x: 400, y: 20 })).toEqual({
      x: 0.5,
      y: 0,
      insideVisibleMedia: false,
    });
    expect(clientPointToRemoteMedia(geometry, { x: 400, y: 20 }, { clamp: false })).toEqual({
      x: 0.5,
      y: -55 / 450,
      insideVisibleMedia: false,
    });
  });

  it("accounts for cover cropping when mapping visible client coordinates", () => {
    const geometry = computeRemoteMediaGeometry({
      containerRect: { left: 10, top: 20, width: 1000, height: 500 },
      mediaWidth: 1600,
      mediaHeight: 1200,
      objectFit: "cover",
    })!;

    expect(geometry.displayRect).toEqual({ left: 10, top: -105, width: 1000, height: 750 });
    expect(geometry.visibleRect).toEqual({ left: 10, top: 20, width: 1000, height: 500 });
    expect(clientPointToRemoteMedia(geometry, { x: 10, y: 20 })).toEqual({
      x: 0,
      y: 1 / 6,
      insideVisibleMedia: true,
    });
    expect(clientPointToRemoteMedia(geometry, { x: 1010, y: 520 })).toEqual({
      x: 1,
      y: 5 / 6,
      insideVisibleMedia: true,
    });
  });

  it("rejects non-finite and zero-sized geometry", () => {
    expect(
      computeRemoteMediaGeometry({
        containerRect: { left: 0, top: 0, width: 0, height: 500 },
        mediaWidth: 1600,
        mediaHeight: 900,
        objectFit: "contain",
      }),
    ).toBeUndefined();
    expect(
      computeRemoteMediaGeometry({
        containerRect: { left: Number.NaN, top: 0, width: 800, height: 500 },
        mediaWidth: 1600,
        mediaHeight: 900,
        objectFit: "cover",
      }),
    ).toBeUndefined();
    expect(
      computeRemoteMediaGeometry({
        containerRect: { left: 0, top: 0, width: 800, height: 500 },
        mediaWidth: Number.POSITIVE_INFINITY,
        mediaHeight: 900,
        objectFit: "contain",
      }),
    ).toBeUndefined();
  });
});
