// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";

import {
  FULLSCREEN_REVEAL_DELAY_MS,
  useFullscreenChromeAutoHide,
} from "../src/components/useFullscreenChromeAutoHide.js";

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

  it("waits 5 stationary seconds before revealing in fullscreen mode", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      const anchorRef = useRef<HTMLElement | null>(null);
      return useFullscreenChromeAutoHide(true, [anchorRef], { revealDelayMs: FULLSCREEN_REVEAL_DELAY_MS });
    });

    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);

    // 刚移到顶部时不立刻弹出，4.999s 时依然隐藏。
    movePointer(640, 12);
    expect(result.current.hidden).toBe(true);
    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(result.current.hidden).toBe(true);

    // 静止不动满 5 秒才弹出。
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.hidden).toBe(false);
  });

  it("resets the 5s reveal timer when the cursor keeps moving inside the top zone and cancels on exit", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      const anchorRef = useRef<HTMLElement | null>(null);
      return useFullscreenChromeAutoHide(true, [anchorRef], { revealDelayMs: FULLSCREEN_REVEAL_DELAY_MS });
    });

    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);

    movePointer(500, 14);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current.hidden).toBe(true);

    // 移动到新坐标（仍在顶部）：重新从头计算 5 秒。
    movePointer(540, 14);
    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(result.current.hidden).toBe(true);

    // 坐标未变的重复事件不应打断倒计时。
    movePointer(540, 14);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.hidden).toBe(false);

    // 移出顶部并等待隐藏，再验证“中途离开热区取消倒计时”。
    movePointer(540, 400);
    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);

    movePointer(540, 14);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    movePointer(540, 260);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(result.current.hidden).toBe(true);
  });

  it("resets the 5s timer on click/wheel/key interaction and cancels if the pointer leaves the window", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      const anchorRef = useRef<HTMLElement | null>(null);
      return useFullscreenChromeAutoHide(true, [anchorRef], { revealDelayMs: FULLSCREEN_REVEAL_DELAY_MS });
    });

    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);

    movePointer(500, 10);
    act(() => {
      vi.advanceTimersByTime(3_500);
      window.dispatchEvent(new Event("pointerdown"));
      vi.advanceTimersByTime(4_000);
    });
    expect(result.current.hidden).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.hidden).toBe(false);

    movePointer(500, 300);
    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);

    // 光标从顶边滑出窗口（如切换到另一块屏幕或系统面板），不应 5 秒后幽灵弹出。
    movePointer(500, 4);
    act(() => {
      vi.advanceTimersByTime(3_000);
      document.dispatchEvent(new Event("mouseleave"));
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.hidden).toBe(true);
  });

  it("keeps newly revealed fullscreen topbar open under the motionless cursor until pointer leaves", () => {
    vi.useFakeTimers();
    let isChromeHidden = false;
    const topbar = document.createElement("header");
    topbar.getBoundingClientRect = () =>
      (isChromeHidden
        ? { left: 0, right: 1280, top: -48, bottom: 0, width: 1280, height: 48, x: 0, y: -48 }
        : { left: 0, right: 1280, top: 0, bottom: 48, width: 1280, height: 48, x: 0, y: 0 }) as DOMRect;

    const { result } = renderHook(() => {
      const topbarRef = useRef<HTMLElement | null>(topbar);
      return useFullscreenChromeAutoHide(true, [topbarRef], { revealDelayMs: FULLSCREEN_REVEAL_DELAY_MS });
    });

    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    isChromeHidden = result.current.hidden;
    expect(isChromeHidden).toBe(true);

    movePointer(600, 20);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    isChromeHidden = result.current.hidden;
    expect(isChromeHidden).toBe(false);

    // 即使光标在弹出后没有再动过，也不应在 2.2 秒后马上缩回。
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current.hidden).toBe(false);

    // 把光标移离顶栏到远控画面区域后，2.2 秒淡出。
    movePointer(600, 320);
    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);
  });

  it("cancels pending fullscreen reveal timers when revealDelayMs turns back to 0", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ revealDelayMs }: { revealDelayMs: number }) => {
        const anchorRef = useRef<HTMLElement | null>(null);
        return useFullscreenChromeAutoHide(true, [anchorRef], { revealDelayMs });
      },
      { initialProps: { revealDelayMs: FULLSCREEN_REVEAL_DELAY_MS } },
    );

    act(() => {
      vi.advanceTimersByTime(2_200);
    });
    expect(result.current.hidden).toBe(true);

    movePointer(500, 12);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    // 退出全屏，正在计时的全屏 5s 定时器应被清掉。
    rerender({ revealDelayMs: 0 });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.hidden).toBe(true);
  });
});
