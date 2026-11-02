import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const IDLE_HIDE_DELAY_MS = 2200;
const TOP_REVEAL_ZONE_PX = 72;
const ANCHOR_REVEAL_PADDING_PX = 56;

export interface FullscreenChromeHoverBindings {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
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
 * 这里改为：切入沉浸态先显示 2.2 秒并自动淡出；之后只有鼠标触到屏幕顶边，
 * 或移到顶栏 / 工具栏原本所在的位置附近，才会重新唤出。
 *
 * 隐藏态只做 opacity，不做位移，锚点矩形仍在原位，
 * 否则"移回原位置唤出"就永远不可能命中。
 *
 * anchors 传入所有需要"鼠标压住就别淡出"的悬浮层（顶栏、工具栏），
 * 鼠标落在其中任一区域时保持可见。
 */
export function useFullscreenChromeAutoHide(
  enabled: boolean,
  anchorRefs: readonly RefObject<HTMLElement | null>[],
): FullscreenChromeAutoHide {
  const [hidden, setHidden] = useState(false);
  const hoveringRef = useRef(false);
  const holdingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  // 靠近唤出用边缘触发：鼠标必须先从远处移进来才唤一次，
  // 否则在画面底部（被控端任务栏就在那儿）来回操作会一直把工具栏顶出来。
  const nearArmedRef = useRef(true);
  // 用 ref 存 anchor 列表，避免调用方每次渲染传新数组导致 effect 反复重建、计时被清零。
  const anchorRefsRef = useRef(anchorRefs);
  anchorRefsRef.current = anchorRefs;

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
      nearArmedRef.current = true;
      setHidden(false);
      return;
    }

    reveal();

    function handlePointerMove(event: globalThis.PointerEvent) {
      const anchors = collectAnchors(anchorRefsRef.current);
      // 鼠标正压在悬浮层上：常见于悬浮层"在光标下方淡入"，此时不能计时隐藏。
      if (isInsideAnyAnchor(anchors, event.clientX, event.clientY)) {
        hoveringRef.current = true;
        nearArmedRef.current = false;
        setHidden(false);
        clearTimer();
        return;
      }
      // 触顶永远唤出：这是最明确、也最不会误触的手势。
      if (event.clientY <= TOP_REVEAL_ZONE_PX) {
        nearArmedRef.current = true;
        reveal();
        return;
      }
      // 靠近悬浮层原位：只在"从远处移进来"的那一下唤出，停在附近继续操作不再反复唤起。
      if (isNearAnyAnchor(anchors, event.clientX, event.clientY)) {
        if (nearArmedRef.current) {
          nearArmedRef.current = false;
          reveal();
        }
        return;
      }
      nearArmedRef.current = true;
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
  }, [clearTimer, enabled, reveal, scheduleHide]);

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
      nearArmedRef.current = true;
      scheduleHide();
    },
  };

  return { hidden: enabled && hidden, hoverBindings, setHolding };
}
