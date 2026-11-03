import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DesktopNewWindowButton } from "../src/desktop/DesktopNewWindowButton.js";
import type { DesktopBridge } from "../src/desktop/desktopBridge.js";

// 这里只用到"桥接存在与否"，窗口控制能力用不到。
const bridge = { isDesktop: true, platform: "linux" } as unknown as DesktopBridge;

describe("DesktopNewWindowButton", () => {
  afterEach(() => {
    cleanup();
    delete window.uurcDesktop;
    vi.restoreAllMocks();
  });

  it("浏览器里不渲染（没有桌面壳就无法多开窗口）", () => {
    const { container } = render(<DesktopNewWindowButton className="x" />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("桌面壳里点击会请求新开窗口", () => {
    window.uurcDesktop = bridge;
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { getByLabelText } = render(<DesktopNewWindowButton className="x" />);

    getByLabelText("新开一个窗口").click();

    // 走 window.open 而不是自己找 Electron API：主进程的 setWindowOpenHandler 会接住。
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]?.[1]).toBe("_blank");
  });
});
