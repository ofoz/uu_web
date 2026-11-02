// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useRemoteWindowFullscreen } from "../src/controllers/useRemoteWindowFullscreen.js";

describe("useRemoteWindowFullscreen", () => {
  it("toggles the fullscreen layout without requesting an exclusive fullscreen window", () => {
    const request = vi.fn();
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      configurable: true,
      writable: true,
      value: request,
    });

    try {
      const { result } = renderHook(() => useRemoteWindowFullscreen());

      expect(result.current.isFullscreen).toBe(false);

      act(() => {
        result.current.toggle();
      });
      expect(result.current.isFullscreen).toBe(true);

      act(() => {
        result.current.toggle();
      });
      expect(result.current.isFullscreen).toBe(false);

      // 故意不动 HTML5 Fullscreen API：它会连带盖住系统任务栏。
      expect(request).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
    }
  });

  it("resets the layout when exit is called", () => {
    const { result } = renderHook(() => useRemoteWindowFullscreen());

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isFullscreen).toBe(true);

    act(() => {
      result.current.exit();
    });
    expect(result.current.isFullscreen).toBe(false);
  });
});
