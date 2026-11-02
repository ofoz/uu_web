import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";

type FloatingPanelPosition = {
  left: number;
  top: number;
};

type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

const PANEL_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function constrainPanelPosition(panel: HTMLElement, left: number, top: number): FloatingPanelPosition {
  const panelRect = panel.getBoundingClientRect();
  const parentRect = panel.parentElement?.getBoundingClientRect();
  const hasParentBounds = Boolean(parentRect && parentRect.width > 0 && parentRect.height > 0);
  const minLeft = Math.max(PANEL_MARGIN, hasParentBounds ? parentRect!.left + PANEL_MARGIN : PANEL_MARGIN);
  const minTop = Math.max(PANEL_MARGIN, hasParentBounds ? parentRect!.top + PANEL_MARGIN : PANEL_MARGIN);
  const maxLeft = Math.max(
    minLeft,
    Math.min(
      window.innerWidth - panelRect.width - PANEL_MARGIN,
      hasParentBounds
        ? parentRect!.right - panelRect.width - PANEL_MARGIN
        : window.innerWidth - panelRect.width - PANEL_MARGIN,
    ),
  );
  const maxTop = Math.max(
    minTop,
    Math.min(
      window.innerHeight - panelRect.height - PANEL_MARGIN,
      hasParentBounds
        ? parentRect!.bottom - panelRect.height - PANEL_MARGIN
        : window.innerHeight - panelRect.height - PANEL_MARGIN,
    ),
  );

  return {
    left: clamp(left, minLeft, maxLeft),
    top: clamp(top, minTop, maxTop),
  };
}

export function useDraggableFloatingPanel<T extends HTMLElement>(enabled = true) {
  const panelRef = useRef<T | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [position, setPosition] = useState<FloatingPanelPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const hasPosition = position !== null;

  // 禁用拖拽时清掉自定义坐标，让工具栏回到 CSS 中定义的停靠位置。
  useEffect(() => {
    if (!enabled) setPosition(null);
  }, [enabled]);

  const panelStyle = useMemo<CSSProperties | undefined>(() => {
    if (!enabled || !position) return undefined;
    // 拖动后用 position:fixed + 视口坐标，避免父级布局变化造成位置跳动。
    return {
      position: "fixed",
      bottom: "auto",
      left: `${position.left}px`,
      top: `${position.top}px`,
      transform: "none",
    };
  }, [enabled, position]);

  const moveToPointer = useCallback((clientX: number, clientY: number) => {
    const panel = panelRef.current;
    const dragState = dragStateRef.current;
    if (!panel || !dragState) return;

    setPosition(constrainPanelPosition(panel, clientX - dragState.offsetX, clientY - dragState.offsetY));
  }, []);

  const clampCurrentPosition = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    setPosition((current) => {
      if (!current) return current;
      const next = constrainPanelPosition(panel, current.left, current.top);
      return next.left === current.left && next.top === current.top ? current : next;
    });
  }, []);

  useEffect(() => {
    if (!enabled || !hasPosition) return;
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(clampCurrentPosition) : undefined;
    if (panel) resizeObserver?.observe(panel);
    if (parent) resizeObserver?.observe(parent);

    const mutationObserver =
      typeof MutationObserver === "function" && parent ? new MutationObserver(clampCurrentPosition) : undefined;
    mutationObserver?.observe(parent!, { attributes: true, attributeFilter: ["class", "style"] });

    window.addEventListener("resize", clampCurrentPosition);
    window.addEventListener("scroll", clampCurrentPosition, true);
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", clampCurrentPosition);
      window.removeEventListener("scroll", clampCurrentPosition, true);
    };
  }, [clampCurrentPosition, enabled, hasPosition]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    const panel = panelRef.current;
    if (!panel) return;

    const panelRect = panel.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
    };
    setIsDragging(true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events used by tests do not always create an active pointer.
    }
    event.preventDefault();
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) return;
      moveToPointer(event.clientX, event.clientY);
      event.preventDefault();
    },
    [moveToPointer],
  );

  useEffect(() => {
    const onWindowPointerMove = (event: globalThis.PointerEvent) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) return;
      moveToPointer(event.clientX, event.clientY);
      event.preventDefault();
    };
    const onWindowPointerEnd = (event: globalThis.PointerEvent) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) return;
      dragStateRef.current = null;
      setIsDragging(false);
    };
    const onWindowBlur = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", onWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", onWindowPointerEnd);
    window.addEventListener("pointercancel", onWindowPointerEnd);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerEnd);
      window.removeEventListener("pointercancel", onWindowPointerEnd);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [moveToPointer]);

  const finishDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setIsDragging(false);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // The pointer may already be released by the browser or a test harness.
    }
    event.preventDefault();
  }, []);

  return {
    panelRef,
    panelStyle,
    isDragging,
    dragHandleProps: {
      onPointerCancel: finishDrag,
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
    },
  };
}
