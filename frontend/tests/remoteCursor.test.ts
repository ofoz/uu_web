import { describe, expect, it } from "vitest";

import { REMOTE_CURSOR_IMAGE_LIMITS, createRemoteCursorPresentation } from "../src/remote/remoteCursor.js";

describe("remote cursor presentation", () => {
  it("maps native cursor types to browser cursor kinds", () => {
    expect(createRemoteCursorPresentation({ cursorType: 0x7f00 }).kind).toBe("default");
    expect(createRemoteCursorPresentation({ cursorType: 0x7f01 }).kind).toBe("text");
    expect(createRemoteCursorPresentation({ cursorType: 0x7f03 }).kind).toBe("crosshair");
    expect(createRemoteCursorPresentation({ cursorType: 0x7f82 }).kind).toBe("nwse-resize");
    expect(createRemoteCursorPresentation({ cursorType: 0x7f84 }).kind).toBe("ew-resize");
    expect(createRemoteCursorPresentation({ cursorType: 0x7f89 }).kind).toBe("pointer");
    expect(createRemoteCursorPresentation({ cursorType: 123 }).kind).toBe("default");
  });

  it("preserves the hidden cursor sentinel", () => {
    expect(createRemoteCursorPresentation({ cursorType: -1, screenId: 3 })).toMatchObject({
      hidden: true,
      cssFallback: "none",
      screenId: 3,
    });
  });

  it("validates PNG dimensions, scales the hotspot and caps overlay size", () => {
    const bytes = pngHeader(256, 128);
    const cursor = createRemoteCursorPresentation({
      width: 256,
      height: 128,
      posX: 64,
      posY: 32,
      byteValue: bytes,
      cursorType: 0x7f89,
      coordinateXScale: 2,
      coordinateYScale: 2,
    });

    expect(cursor).toMatchObject({
      hidden: false,
      kind: "pointer",
      imageWidth: 256,
      imageHeight: 128,
      renderWidth: 128,
      renderHeight: 64,
      hotspotX: 32,
      hotspotY: 16,
      imageDensity: 2,
      requiresImageResize: true,
    });
    expect(cursor.imageBytes).toEqual(bytes);
    expect(cursor.imageBytes).not.toBe(bytes);
  });

  it("keeps the PNG aspect ratio and ignores asymmetric coordinate scales", () => {
    const cursor = createRemoteCursorPresentation({
      width: 30,
      height: 20,
      posX: 15,
      posY: 10,
      byteValue: pngHeader(48, 24),
      coordinateXScale: 2,
      coordinateYScale: 3,
    });

    expect(cursor).toMatchObject({
      imageWidth: 48,
      imageHeight: 24,
      renderWidth: 30,
      renderHeight: 15,
      hotspotX: 15,
      hotspotY: 8,
      imageDensity: 1.6,
      requiresImageResize: true,
    });
  });

  it("does not enlarge a cursor PNG when reported bounds are larger", () => {
    expect(
      createRemoteCursorPresentation({
        width: 96,
        height: 96,
        byteValue: pngHeader(48, 24),
      }),
    ).toMatchObject({
      renderWidth: 48,
      renderHeight: 24,
      imageDensity: 1,
      requiresImageResize: false,
    });
  });

  it("clamps invalid hotspots and ignores non-PNG or oversized image data", () => {
    const cursor = createRemoteCursorPresentation({
      width: 32,
      height: 32,
      posX: 999,
      posY: -50,
      byteValue: pngHeader(32, 32),
    });
    expect(cursor.hotspotX).toBe(31);
    expect(cursor.hotspotY).toBe(0);

    const invalidImage = createRemoteCursorPresentation({
      cursorType: 0x7f01,
      byteValue: new Uint8Array([1, 2, 3]),
    });
    expect(invalidImage).toMatchObject({
      kind: "text",
      renderWidth: 18,
      renderHeight: 24,
      hotspotX: 9,
      hotspotY: 12,
    });
    expect(invalidImage.imageBytes).toBeUndefined();
    expect(
      createRemoteCursorPresentation({
        cursorType: 0x7f03,
        byteValue: new Uint8Array(REMOTE_CURSOR_IMAGE_LIMITS.maxBytes + 1),
      }),
    ).toMatchObject({ kind: "crosshair" });
  });
});

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}
