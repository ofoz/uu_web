import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const IDLE_HIDE_DELAY_MS = 2200;
const TOP_REVEAL_ZONE_PX = 72;
const ANCHOR_REVEAL_PADDING_PX = 56;

export interface FullscreenChromeHoverBindings {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export interface FullscreenChromeAutoHide {
  /** 全屏下悬浮层（状态徽标 / 工具栏 / 提示）是否处于隐藏态。 */
  hidden: boolean;
  /** 挂到悬浮层上，鼠标停留在上面时保持可见。 */
  hoverBindings: FullscreenChromeHoverBindings;
  /** 拖动等场景可临时钉住悬浮层，避免拖到一半淡出。 */
  setHolding: (holding: boolean) => void;
}

function isNearAnchor(anchor: HTMLElement | null, clientX: number, clientY: number): boolean {
  if (!anchor) return false;
  const rect = anchor.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return (
    clientX >= rect.left - ANCHOR_REVEAL_PADDING_PX &&
    clientX <= rect.right + ANCHOR_REVEAL_PADDING_PX &&
    clientY >= rect.top - ANCHOR_REVEAL_PADDING_PX &&
    clientY <= rect.bottom + ANCHOR_REVEAL_PADDING_PX
  );
}

function isInsideAnchor(anchor: HTMLElement | null, clientX: number, clientY: number): boolean {
  if (!anchor) return false;
  const rect = anchor.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

/**
 * 全屏时的悬浮层自动隐藏。
 *
 * 远控过程中鼠标一直在动，所以不能"一动就显示"——那样工具栏会永远挂在画面上。
 * 这里改为：进入全屏先显示 2.2 秒并自动淡出；之后只有鼠标触到屏幕顶边，
 * 或移到工具栏原本所在的位置附近，才会重新唤出。
 */
export function useFullscreenChromeAutoHide(
  enabled: boolean,
  anchorRef?: RefObject<HTMLElement | null>,
): FullscreenChromeAutoHide {
  const [hidden, setHidden] = useState(false);
  const hoveringRef = useRef(false);
  const holdingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    clearTimer();
    if (hoveringRef.current || holdingRef.current) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (hoveringRef.current || holdingRef.current) return;
      setHidden(true);
    }, IDLE_HIDE_DELAY_MS);
  }, [clearTimer]);

  const reveal = useCallback(() => {
    setHidden(false);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (!enabled) {
      clearTimer();
      setHidden(false);
      return;
    }

    reveal();

    function handlePointerMove(event: globalThis.PointerEvent) {
      const anchor = anchorRef?.current ?? null;
      // 鼠标正压在工具栏上：常见于工具栏"在光标下方淡入"，此时不能计时隐藏。
      if (isInsideAnchor(anchor, event.clientX, event.clientY)) {
        hoveringRef.current = true;
        setHidden(false);
        clearTimer();
        return;
      }
      // 触顶或回到工具栏附近才唤出；画面中央的常规操作不唤出，否则工具栏会一直挂着。
      if (event.clientY <= TOP_REVEAL_ZONE_PX || isNearAnchor(anchor, event.clientX, event.clientY)) {
        reveal();
        return;
      }
      if (hoveringRef.current) {
        hoveringRef.current = false;
        scheduleHide();
      }
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      clearTimer();
    };
  }, [anchorRef, clearTimer, enabled, reveal, scheduleHide]);

  const setHolding = useCallback(
    (holding: boolean) => {
      holdingRef.current = holding;
      if (holding) clearTimer();
      else scheduleHide();
    },
    [clearTimer, scheduleHide],
  );

  const hoverBindings: FullscreenChromeHoverBindings = {
    onPointerEnter: () => {
      hoveringRef.current = true;
      clearTimer();
    },
    onPointerLeave: () => {
      hoveringRef.current = false;
      scheduleHide();
    },
  };

  return { hidden: enabled && hidden, hoverBindings, setHolding };
}
