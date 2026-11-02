import { DesktopWindowControls } from "./DesktopWindowControls.js";
import { useDesktopBridge } from "./useDesktopBridge.js";

/**
 * 无边框窗口的三个按钮：固定贴在视口右上角（也就是系统标题栏按钮原本的位置）。
 * 挂在 App 根节点上，首页、登录页、设备页、远控页共用一套，
 * 不用每个布局再各放一份，也不会随切页/滚动/侧栏伸缩漂移。
 */
export function DesktopWindowDock() {
  const bridge = useDesktopBridge();
  if (!bridge) return null;

  return (
    <div className="desktop-window-dock">
      <DesktopWindowControls bridge={bridge} />
    </div>
  );
}
