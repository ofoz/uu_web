import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopBridge } from "../src/desktop/desktopBridge.js";
import { useTaskbarTitle } from "../src/desktop/useTaskbarTitle.js";
import { openConnection, resetConnections } from "../src/remote/remoteConnectionsStore.js";

/** 只挂 hook，不渲染整个 App：这条逻辑跟路由和设备名有关，跟页面内容无关。 */
function Probe() {
  useTaskbarTitle();
  return null;
}

function renderAt(path: string): void {
  render(
    (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    ) as ReactNode,
  );
}

function fakeBridge(): { bridge: DesktopBridge; setWindowTitle: ReturnType<typeof vi.fn> } {
  const setWindowTitle = vi.fn();
  const bridge = {
    isDesktop: true,
    platform: "linux",
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
    getWindowState: async () => ({ maximized: false }),
    onWindowStateChange: () => () => {},
    setWindowTitle,
  } as unknown as DesktopBridge;
  return { bridge, setWindowTitle };
}

describe("useTaskbarTitle", () => {
  beforeEach(() => {
    resetConnections();
  });

  afterEach(() => {
    cleanup();
    delete window.uurcDesktop;
    resetConnections();
    vi.restoreAllMocks();
  });

  it("远控页把设备名写进任务栏标题，多窗口才能一眼区分", () => {
    const { bridge, setWindowTitle } = fakeBridge();
    window.uurcDesktop = bridge;
    openConnection({
      deviceId: "desktop-1",
      deviceName: "Office Mac",
      handoff: {} as never,
    });

    renderAt("/devices/desktop-1/control");

    expect(setWindowTitle).toHaveBeenCalledWith("Office Mac · UU 远程");
  });

  it("不在远控页时用应用名，不要把设备名带到设备列表的标题上", () => {
    const { bridge, setWindowTitle } = fakeBridge();
    window.uurcDesktop = bridge;
    openConnection({
      deviceId: "desktop-1",
      deviceName: "Office Mac",
      handoff: {} as never,
    });

    renderAt("/devices");

    expect(setWindowTitle).toHaveBeenCalledWith("UU 远程");
  });

  it("刚连上、连接仓还没写入名字时给兜底文案，不闪回“远程控制”", () => {
    const { bridge, setWindowTitle } = fakeBridge();
    window.uurcDesktop = bridge;

    renderAt("/devices/desktop-9/control");

    expect(setWindowTitle).toHaveBeenCalledWith("远程控制 · UU 远程");
  });

  it("浏览器里没有桌面壳，不碰任何窗口标题", () => {
    renderAt("/devices/desktop-1/control");
    // 没有桥接时 hook 必须安静退出，不能抛错（浏览器标签页不需要这个能力）。
    expect(window.uurcDesktop).toBeUndefined();
  });
});
