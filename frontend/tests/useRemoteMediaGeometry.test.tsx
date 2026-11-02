// @vitest-environment jsdom
import { useEffect, useRef } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useRemoteMediaGeometry } from "../src/controllers/useRemoteMediaGeometry.js";

describe("useRemoteMediaGeometry", () => {
  it("publishes geometry refreshes without using React state and supports unsubscribe", async () => {
    let currentRect = new DOMRect(10, 20, 800, 450);
    let controller: ReturnType<typeof useRemoteMediaGeometry> | undefined;
    render(
      <GeometryHarness
        getRect={() => currentRect}
        onController={(nextController) => {
          controller = nextController;
        }}
      />,
    );
    await waitFor(() => expect(controller?.geometryRef.current).toBeDefined());

    const listener = vi.fn();
    const unsubscribe = controller!.subscribeGeometryChange(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    currentRect = new DOMRect(40, 60, 800, 450);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(controller!.geometryRef.current?.containerRect).toMatchObject({ left: 40, top: 60 });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    act(() => controller!.refreshGeometry());
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

function GeometryHarness({
  getRect,
  onController,
}: {
  getRect(): DOMRect;
  onController(controller: ReturnType<typeof useRemoteMediaGeometry>): void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const controller = useRemoteMediaGeometry({ stageRef, viewMode: "fit", primaryVideoId: "video-1" });
  useEffect(() => onController(controller), [controller, onController]);
  return (
    <div
      ref={(element) => {
        stageRef.current = element;
        if (element) element.getBoundingClientRect = getRect;
      }}
    >
      <video data-active="true" />
    </div>
  );
}
