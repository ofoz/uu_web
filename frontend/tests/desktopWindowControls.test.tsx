import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DesktopWindowDock } from "../src/desktop/DesktopWindowDock.js";
import { DesktopWindowControls } from "../src/desktop/DesktopWindowControls.js";
import type { DesktopBridge } from "../src/desktop/desktopBridge.js";

function createBridge(overrides: Partial<DesktopBridge> = {}) {
  let listener: ((state: { maximized: boolean }) => void) | null = null;
  const bridge: DesktopBridge = {
    isDesktop: true,
    platform: "linux",
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    getWindowState: vi.fn().mockResolvedValue({ maximized: true }),
    onWindowStateChange: vi.fn((handler) => {
      listener = handler;
      return () => {
        listener = null;
      };
    }),
    ...overrides,
  };
  return {
    bridge,
    emitMaximized(maximized: boolean) {
      listener?.({ maximized });
    },
    hasListener: () => listener !== null,
  };
}

describe("DesktopWindowControls", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.uurcDesktop;
  });

  it("把三个窗口按钮接到壳桥接上", async () => {
    const { bridge } = createBridge();
    render(<DesktopWindowControls bridge={bridge} />);

    fireEvent.click(screen.getByLabelText("最小化"));
    fireEvent.click(screen.getByLabelText("关闭窗口"));
    // 最大化状态是异步读回来的，等按钮语义稳定后再点。
    fireEvent.click(await screen.findByLabelText("还原窗口"));

    expect(bridge.minimize).toHaveBeenCalledTimes(1);
    expect(bridge.close).toHaveBeenCalledTimes(1);
    expect(bridge.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("按主进程推送的最大化状态切换按钮语义", async () => {
    const { bridge, emitMaximized } = createBridge();
    render(<DesktopWindowControls bridge={bridge} />);

    // 初始状态来自 getWindowState（maximized: true）
    expect(await screen.findByLabelText("还原窗口")).toBeTruthy();

    emitMaximized(false);
    await waitFor(() => expect(screen.getByLabelText("最大化窗口")).toBeTruthy());

    emitMaximized(true);
    await waitFor(() => expect(screen.getByLabelText("还原窗口")).toBeTruthy());
  });

  it("卸载时取消订阅，避免重复注册监听", async () => {
    const { bridge, hasListener } = createBridge();
    const { unmount } = render(<DesktopWindowControls bridge={bridge} />);

    await waitFor(() => expect(hasListener()).toBe(true));
    unmount();
    expect(hasListener()).toBe(false);
  });

  it("停靠区只在桌面壳里出现，浏览访问时不渲染", async () => {
    const { bridge } = createBridge();
    const { container, unmount } = render(<DesktopWindowDock />);
    // 浏览器里没有 window.uurcDesktop，dock 应该直接不渲染。
    expect(container.querySelector(".desktop-window-dock")).toBeNull();

    window.uurcDesktop = bridge;
    try {
      const mounted = render(<DesktopWindowDock />);
      // 桥接在 effect 里读取，首帧为 null，挂载后才出现。
      await waitFor(() => expect(mounted.container.querySelector(".desktop-window-dock")).not.toBeNull());
      expect(await screen.findByLabelText("最小化")).toBeTruthy();
    } finally {
      delete window.uurcDesktop;
      unmount();
    }
  });
});
