// @vitest-environment jsdom
import { useCallback, useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DecodedStreamerCursorShape } from "@uurc/shared/streamer/controlChannelDecode";

import { useRemoteCursorController } from "../src/controllers/useRemoteCursorController.js";
import type { RemoteMediaGeometry } from "../src/remote/remoteMediaGeometry.js";

describe("useRemoteCursorController", () => {
  let handleRemoteCursorShape: (shape: DecodedStreamerCursorShape | null) => void = () => undefined;
  let updateGeometry: (left: number, top: number) => void = () => undefined;
  let nextObjectUrl = 1;
  const createObjectURL = vi.fn(() => `blob:cursor-${nextObjectUrl++}`);
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    nextObjectUrl = 1;
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies shapes imperatively, revokes old URLs and resets after a display switch", () => {
    const view = render(<CursorHarness active primaryVideoId="video-1" />);
    const stage = view.getByTestId("stage");
    expect(stage.style.getPropertyValue("--remote-cursor")).toBe("default");

    act(() => handleRemoteCursorShape(cursorShape({ posX: 2, posY: 3 })));
    expect(stage.style.getPropertyValue("--remote-cursor")).toContain('url("blob:cursor-1") 2 3, pointer');

    act(() => handleRemoteCursorShape(cursorShape({ posX: 4, posY: 5 })));
    expect(stage.style.getPropertyValue("--remote-cursor")).toContain('url("blob:cursor-2") 4 5, pointer');
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cursor-1");

    view.rerender(<CursorHarness active primaryVideoId="video-2" />);
    expect(stage.style.getPropertyValue("--remote-cursor")).toBe("default");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cursor-2");

    view.unmount();
  });

  it("uses a transform-driven overlay for touch pointers and hides it outside control mode", () => {
    const view = render(<CursorHarness active primaryVideoId="video-1" />);
    const stage = view.getByTestId("stage");
    const overlay = view.getByTestId("overlay");
    act(() => handleRemoteCursorShape(cursorShape({ posX: 2, posY: 3 })));

    act(() => stage.dispatchEvent(pointerEvent("pointerenter", { clientX: 100, clientY: 100 })));
    expect(stage.style.getPropertyValue("--remote-cursor")).toBe("none");
    expect(overlay.dataset.visible).toBe("true");
    expect(overlay.dataset.hasImage).toBe("true");
    expect(overlay.style.transform).toBe("translate3d(88px, 77px, 0)");

    view.rerender(<CursorHarness active={false} primaryVideoId="video-1" />);
    expect(stage.style.getPropertyValue("--remote-cursor")).toBe("");
    expect(overlay.dataset.visible).toBe("false");

    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cursor-1");
  });

  it("repositions a stationary overlay when its media geometry changes", () => {
    const view = render(<CursorHarness active primaryVideoId="video-1" />);
    const stage = view.getByTestId("stage");
    const overlay = view.getByTestId("overlay");
    act(() => handleRemoteCursorShape(cursorShape({ posX: 2, posY: 3 })));
    act(() => stage.dispatchEvent(pointerEvent("pointerenter", { clientX: 100, clientY: 100 })));
    expect(overlay.style.transform).toBe("translate3d(88px, 77px, 0)");

    act(() => updateGeometry(30, 40));
    expect(overlay.style.transform).toBe("translate3d(68px, 57px, 0)");
    view.unmount();
  });

  it("keeps a correctly sized overlay while an image resize is unavailable", () => {
    const view = render(<CursorHarness active primaryVideoId="video-1" />);
    const stage = view.getByTestId("stage");
    const overlay = view.getByTestId("overlay");
    act(() =>
      handleRemoteCursorShape(
        cursorShape({
          width: 16,
          height: 24,
          byteValue: pngHeader(32, 48),
          coordinateXScale: 2,
          coordinateYScale: 2,
        }),
      ),
    );
    act(() => stage.dispatchEvent(pointerEvent("pointerenter", { clientX: 100, clientY: 100 }, "mouse")));

    expect(stage.style.getPropertyValue("--remote-cursor")).toBe("none");
    expect(overlay.dataset.visible).toBe("true");
    expect(overlay.style.width).toBe("16px");
    expect(overlay.style.height).toBe("24px");
    view.unmount();
  });

  it("uses a single image-set density for a Retina cursor when supported", () => {
    vi.stubGlobal("CSS", {
      supports: (_property: string, value: string) => value.includes("image-set("),
    });
    const view = render(<CursorHarness active primaryVideoId="video-1" />);
    const stage = view.getByTestId("stage");

    act(() =>
      handleRemoteCursorShape(
        cursorShape({
          width: 24,
          height: 12,
          posX: 12,
          posY: 6,
          byteValue: pngHeader(48, 24),
          coordinateXScale: 2,
          coordinateYScale: 3,
        }),
      ),
    );

    expect(stage.style.getPropertyValue("--remote-cursor")).toBe('image-set(url("blob:cursor-1") 2x) 12 6, pointer');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("uses a glyph and clears stale image styles when a shape has no image", () => {
    const view = render(<CursorHarness active primaryVideoId="video-1" />);
    const stage = view.getByTestId("stage");
    const overlay = view.getByTestId("overlay");
    act(() => handleRemoteCursorShape(cursorShape({ byteValue: undefined })));
    act(() => stage.dispatchEvent(pointerEvent("pointerenter", { clientX: 100, clientY: 100 })));

    expect(overlay.dataset.cursorKind).toBe("pointer");
    expect(overlay.dataset.hasImage).toBe("false");
    expect(overlay.style.backgroundImage).toBe("");
    view.unmount();
  });

  function CursorHarness({ active, primaryVideoId }: { active: boolean; primaryVideoId: string }) {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const geometryRef = useRef<RemoteMediaGeometry>({
      containerRect: { left: 10, top: 20, width: 1000, height: 500 },
      displayRect: { left: 10, top: 20, width: 1000, height: 500 },
      visibleRect: { left: 10, top: 20, width: 1000, height: 500 },
      mediaWidth: 1600,
      mediaHeight: 800,
      scale: 0.625,
    });
    const geometryListenersRef = useRef(new Set<() => void>());
    const subscribeGeometryChange = useCallback((listener: () => void) => {
      geometryListenersRef.current.add(listener);
      return () => geometryListenersRef.current.delete(listener);
    }, []);
    updateGeometry = (left, top) => {
      const current = geometryRef.current;
      geometryRef.current = {
        ...current,
        containerRect: { ...current.containerRect, left, top },
      };
      for (const listener of geometryListenersRef.current) listener();
    };
    const controller = useRemoteCursorController({
      stageRef,
      geometryRef,
      subscribeGeometryChange,
      active,
      primaryVideoId,
    });
    handleRemoteCursorShape = controller.handleRemoteCursorShape;
    return (
      <div ref={stageRef} data-testid="stage">
        <div data-remote-cursor-overlay data-visible="false" data-testid="overlay" />
      </div>
    );
  }
});

function cursorShape(overrides: Partial<DecodedStreamerCursorShape>): DecodedStreamerCursorShape {
  return {
    width: 16,
    height: 24,
    posX: 1,
    posY: 1,
    byteValue: pngHeader(16, 24),
    cursorType: 0x7f89,
    ...overrides,
  };
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function pointerEvent(type: string, input: { clientX: number; clientY: number }, pointerType = "touch"): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: input.clientX },
    clientY: { value: input.clientY },
    pointerType: { value: pointerType },
  });
  return event;
}
