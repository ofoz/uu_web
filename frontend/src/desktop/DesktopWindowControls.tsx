import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { DesktopBridge } from "./desktopBridge.js";

/**
 * 无边框窗口的窗口按钮。只在 Electron 壳里渲染——浏览器版本没有系统标题栏可替代，
 * 多出这三个按钮反而是噪音。
 */
export function DesktopWindowControls({ bridge }: { bridge: DesktopBridge }) {
  const [maximized, setMaximized] = useState(false);

  const sync = useCallback(() => {
    void bridge
      .getWindowState()
      .then((state) => setMaximized(state.maximized))
      .catch(() => undefined);
  }, [bridge]);

  useEffect(() => {
    sync();
    // 主进程会把 maximize/unmaximize 推过来；resize 作为兜底覆盖其余路径。
    const unsubscribe = bridge.onWindowStateChange((state) => setMaximized(state.maximized));
    window.addEventListener("resize", sync);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", sync);
    };
  }, [bridge, sync]);

  return (
    <span className="desktop-window-controls" aria-label="窗口控制">
      <button
        type="button"
        className="desktop-window-button"
        onClick={bridge.minimize}
        title="最小化"
        aria-label="最小化"
      >
        <Minus size={13} aria-hidden />
      </button>
      <button
        type="button"
        className="desktop-window-button"
        onClick={() => {
          bridge.toggleMaximize();
          window.setTimeout(sync, 120);
        }}
        title={maximized ? "还原" : "最大化"}
        aria-label={maximized ? "还原窗口" : "最大化窗口"}
      >
        {maximized ? <Minimize2 size={12} aria-hidden /> : <Maximize2 size={12} aria-hidden />}
      </button>
      <button
        type="button"
        className="desktop-window-button desktop-window-button--close"
        onClick={bridge.close}
        title="关闭"
        aria-label="关闭窗口"
      >
        <X size={13} aria-hidden />
      </button>
    </span>
  );
}
