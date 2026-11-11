import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const FULLSCREEN_REVEAL_DELAY_MS = 5000;

const IDLE_HIDE_DELAY_MS = 2200;
const TOP_REVEAL_ZONE_PX = 56;
const ANCHOR_REVEAL_PADDING_PX = 56;
const POST_REVEAL_HOVER_CHECK_MS = 220;

export interface FullscreenChromeHoverBindings {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export interface FullscreenChromeAutoHideOptions {
  /**
   * 隐藏态下鼠标进入唤出热区后，需保持静止不动的停留时长（毫秒）。
   * 0 表示移入即刻唤出；全屏模式下传 FULLSCREEN_REVEAL_DELAY_MS（5000ms），避免误触发挡住目标机顶部区域。
   */
  revealDelayMs?: number;
}

export interface FullscreenChromeAutoHide {
  /** 全屏下悬浮层（顶栏 / 状态徽标 / 工具栏 / 提示）是否处于隐藏态。 */
  hidden: boolean;
  /** 挂到悬浮层上，鼠标停留在上面时保持可见。 */
  hoverBindings: FullscreenChromeHoverBindings;
  /** 拖动等场景可临时钉住悬浮层，避免拖到一半淡出。 */
  setHolding: (holding: boolean) => void;
}

function isNearAnyAnchor(anchors: readonly HTMLElement[], clientX: number, clientY: number): boolean {
  for (const anchor of anchors) {
    const rect = anchor.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (
      clientX >= rect.left - ANCHOR_REVEAL_PADDING_PX &&
      clientX <= rect.right + ANCHOR_REVEAL_PADDING_PX &&
      clientY >= rect.top - ANCHOR_REVEAL_PADDING_PX &&
      clientY <= rect.bottom + ANCHOR_REVEAL_PADDING_PX
    ) {
      return true;
    }
  }
  return false;
}

function isInsideAnyAnchor(anchors: readonly HTMLElement[], clientX: number, clientY: number): boolean {
  for (const anchor of anchors) {
    const rect = anchor.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return true;
    }
  }
  return false;
}

function collectAnchors(refs: readonly RefObject<HTMLElement | null>[]): HTMLElement[] {
  const anchors: HTMLElement[] = [];
  for (const ref of refs) {
    const element = ref.current;
    if (element) anchors.push(element);
  }
  return anchors;
}

/**
 * 沉浸模式下的悬浮层自动隐藏（全屏，或已连接远控画面）。
 *
 * 远控过程中鼠标一直在动，所以不能"一动就显示"——那样工具栏会永远挂在画面上。
 * 切入沉浸态先显示 2.2 秒并自动淡出；之后：
 * - 非全屏已连接态（revealDelayMs = 0）：鼠标触顶或从远处靠近顶栏即刻唤出工具栏。
 * - 全屏态（revealDelayMs = 5000）：鼠标移到顶部唤出区域后，必须连续 5 秒不动且无交互才弹出顶栏，
 *   防止路过或点击被控端浏览器标签页 / 窗口标题栏时误触发遮挡。
 *
 * anchors 传入所有需要"鼠标压住就别淡出"的悬浮层（顶栏、工具栏），
 * 鼠标落在其中任一区域时保持可见。
 */
export function useFullscreenChromeAutoHide(
  enabled: boolean,
  anchorRefs: readonly RefObject<HTMLElement | null>[],
  options: FullscreenChromeAutoHideOptions = {},
): FullscreenChromeAutoHide {
  const revealDelayMs = options.revealDelayMs ?? 0;
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const revealDelayMsRef = useRef(revealDelayMs);
  const hoveringRef = useRef(false);
  const holdingRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const postRevealTimerRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  // 靠近唤出用边缘触发：鼠标必须先从远处移进来才唤一次，
  // 否则在画面底部（被控端任务栏就在那儿）来回操作会一直把工具栏顶出来。
  const nearArmedRef = useRef(true);
  // 用 ref 存 anchor 列表，避免调用方每次渲染传新数组导致 effect 反复重建、计时被清零。
  const anchorRefsRef = useRef(anchorRefs);
  anchorRefsRef.current = anchorRefs;

  const setHiddenState = useCallback((next: boolean) => {
    hiddenRef.current = next;
    setHidden(next);
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current === null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current === null) return;
    window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = null;
  }, []);

  const clearPostRevealTimer = useCallback(() => {
    if (postRevealTimerRef.current === null) return;
    window.clearTimeout(postRevealTimerRef.current);
    postRevealTimerRef.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (hoveringRef.current || holdingRef.current) return;
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      if (hoveringRef.current || holdingRef.current) return;
      clearPostRevealTimer();
      setHiddenState(true);
    }, IDLE_HIDE_DELAY_MS);
  }, [clearHideTimer, clearPostRevealTimer, setHiddenState]);

  const reveal = useCallback(() => {
    clearRevealTimer();
    clearPostRevealTimer();
    setHiddenState(false);
    scheduleHide();
  }, [clearPostRevealTimer, clearRevealTimer, scheduleHide, setHiddenState]);

  const scheduleDelayedReveal = useCallback(
    (delayMs: number) => {
      clearRevealTimer();
      clearPostRevealTimer();
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        if (!hiddenRef.current) return;
        nearArmedRef.current = false;
        reveal();
        // 顶栏用 0.18s CSS transition 从屏幕上方滑入，等过渡完成后若静止光标正好落在顶栏内，
        // 锁定 hovering 状态，避免等待 5 秒唤出后 2.2 秒又在光标下自动缩回。
        postRevealTimerRef.current = window.setTimeout(() => {
          postRevealTimerRef.current = null;
          const lastPointer = lastPointerRef.current;
          if (!lastPointer || hiddenRef.current) return;
          const anchors = collectAnchors(anchorRefsRef.current);
          if (isInsideAnyAnchor(anchors, lastPointer.clientX, lastPointer.clientY)) {
            hoveringRef.current = true;
            clearHideTimer();
          }
        }, POST_REVEAL_HOVER_CHECK_MS);
      }, delayMs);
    },
    [clearHideTimer, clearPostRevealTimer, clearRevealTimer, reveal],
  );

  useEffect(() => {
    revealDelayMsRef.current = revealDelayMs;
    if (revealDelayMs <= 0) {
      clearRevealTimer();
      clearPostRevealTimer();
    }
  }, [clearPostRevealTimer, clearRevealTimer, revealDelayMs]);

  useEffect(() => {
    if (!enabled) {
      clearHideTimer();
      clearRevealTimer();
      clearPostRevealTimer();
      nearArmedRef.current = true;
      hoveringRef.current = false;
      lastPointerRef.current = null;
      setHiddenState(false);
      return;
    }

    reveal();

    function handlePointerMove(event: globalThis.PointerEvent) {
      const { clientX, clientY } = event;
      const previousPointer = lastPointerRef.current;
      const pointerMoved =
        previousPointer === null || previousPointer.clientX !== clientX || previousPointer.clientY !== clientY;
      lastPointerRef.current = { clientX, clientY };

      const anchors = collectAnchors(anchorRefsRef.current);
      const insideAnchor = isInsideAnyAnchor(anchors, clientX, clientY);
      const delayMs = revealDelayMsRef.current;

      // 全屏隐藏态下启用停留延迟：进入热区开始 5 秒倒计时；坐标不变的重复事件不打断计时，
      // 坐标变化则重新计满 5 秒，离开热区立即取消。
      if (hiddenRef.current && delayMs > 0) {
        const inRevealZone =
          clientY <= TOP_REVEAL_ZONE_PX ||
          insideAnchor ||
          (nearArmedRef.current && isNearAnyAnchor(anchors, clientX, clientY));

        if (!inRevealZone) {
          nearArmedRef.current = true;
          clearRevealTimer();
          return;
        }

        if (!pointerMoved && revealTimerRef.current !== null) {
          return;
        }

        scheduleDelayedReveal(delayMs);
        return;
      }

      // 悬浮层已可见，或未启用停留延迟（delayMs = 0）：
      // 鼠标压在悬浮层上时保持可见，不计时隐藏。
      if (insideAnchor) {
        hoveringRef.current = true;
        nearArmedRef.current = false;
        clearRevealTimer();
        setHiddenState(false);
        clearHideTimer();
        return;
      }

      if (clientY <= TOP_REVEAL_ZONE_PX) {
        if (delayMs <= 0) {
          nearArmedRef.current = true;
          reveal();
        } else if (hoveringRef.current) {
          hoveringRef.current = false;
          scheduleHide();
        }
        return;
      }

      if (isNearAnyAnchor(anchors, clientX, clientY)) {
        if (delayMs <= 0 && nearArmedRef.current) {
          nearArmedRef.current = false;
          reveal();
        } else if (hoveringRef.current) {
          hoveringRef.current = false;
          scheduleHide();
        }
        return;
      }

      nearArmedRef.current = true;
      if (hoveringRef.current) {
        hoveringRef.current = false;
        scheduleHide();
      }
    }

    function handleActiveInteraction() {
      if (!hiddenRef.current || revealDelayMsRef.current <= 0) return;
      if (revealTimerRef.current === null) return;
      scheduleDelayedReveal(revealDelayMsRef.current);
    }

    function handleViewportExit() {
      clearRevealTimer();
      clearPostRevealTimer();
      lastPointerRef.current = null;
      if (hoveringRef.current) {
        hoveringRef.current = false;
        scheduleHide();
      }
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handleActiveInteraction, { passive: true });
    window.addEventListener("wheel", handleActiveInteraction, { passive: true });
    window.addEventListener("keydown", handleActiveInteraction, { passive: true });
    window.addEventListener("blur", handleViewportExit);
    document.addEventListener("mouseleave", handleViewportExit);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handleActiveInteraction);
      window.removeEventListener("wheel", handleActiveInteraction);
      window.removeEventListener("keydown", handleActiveInteraction);
      window.removeEventListener("blur", handleViewportExit);
      document.removeEventListener("mouseleave", handleViewportExit);
      clearHideTimer();
      clearRevealTimer();
      clearPostRevealTimer();
    };
  }, [
    clearHideTimer,
    clearPostRevealTimer,
    clearRevealTimer,
    enabled,
    reveal,
    scheduleDelayedReveal,
    scheduleHide,
    setHiddenState,
  ]);

  const setHolding = useCallback(
    (holding: boolean) => {
      holdingRef.current = holding;
      if (holding) clearHideTimer();
      else scheduleHide();
    },
    [clearHideTimer, scheduleHide],
  );

  const hoverBindings: FullscreenChromeHoverBindings = {
    onPointerEnter: () => {
      if (hiddenRef.current) return;
      hoveringRef.current = true;
      clearHideTimer();
    },
    onPointerLeave: () => {
      hoveringRef.current = false;
      nearArmedRef.current = true;
      if (!hiddenRef.current) {
        scheduleHide();
      }
    },
  };

  return { hidden: enabled && hidden, hoverBindings, setHolding };
}
