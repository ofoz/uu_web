// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";

import { useFullscreenChromeAutoHide } from "../src/components/useFullscreenChromeAutoHide.js";

function movePointer(clientX: number, clientY: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent("pointermove", { clientX, clientY }));
  });
}

describe("useFullscreenChromeAutoHide", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides the chrome after the idle delay and reveals it when the pointer hits the top edge", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      const anchorRef = useRef<HTMLElement | null>(null);
      return useFullscreenChromeAutoHide(true, [anchorRef]);
    });

    expect(result.current.hidden).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);

    movePointer(640, 8);
    expect(result.current.hidden).toBe(false);

    // 鼠标停在画面上不再触顶，2.2 秒后重新淡出。
    movePointer(640, 600);
    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);
  });

  it("stays visible while the pointer hovers the chrome", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      const anchorRef = useRef<HTMLElement | null>(null);
      return useFullscreenChromeAutoHide(true, [anchorRef]);
    });

    act(() => {
      result.current.hoverBindings.onPointerEnter();
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.hidden).toBe(false);

    act(() => {
      result.current.hoverBindings.onPointerLeave();
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);
  });

  it("reveals only once when the pointer enters the chrome area, not on every move nearby", () => {
    vi.useFakeTimers();
    const bar = document.createElement("div");
    bar.getBoundingClientRect = () =>
      ({ left: 400, right: 600, top: 500, bottom: 540, width: 200, height: 40, x: 400, y: 500 }) as DOMRect;

    const { result } = renderHook(() => {
      const anchorRef = useRef<HTMLElement | null>(bar);
      return useFullscreenChromeAutoHide(true, [anchorRef]);
    });

    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);

    // 从远处移到工具栏上方的热区：唤出一次。
    movePointer(500, 480);
    expect(result.current.hidden).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);

    // 继续在同一热区来回晃：不再反复唤出，避免挡住被控端任务栏。
    movePointer(520, 470);
    movePointer(560, 485);
    expect(result.current.hidden).toBe(true);
  });

  it("never hides when fullscreen is off", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      const anchorRef = useRef<HTMLElement | null>(null);
      return useFullscreenChromeAutoHide(false, [anchorRef]);
    });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.hidden).toBe(false);
  });
});
