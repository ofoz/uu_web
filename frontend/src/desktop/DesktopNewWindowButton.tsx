import { SquarePlus } from "lucide-react";

import { getDesktopBridge } from "./desktopBridge.js";

/**
 * 新开一个独立窗口（只在桌面壳里出现）。
 *
 * 多窗口之所以能同时控多台设备，是因为每个窗口是独立的 webContents、
 * sessionStorage 各自独立 → 各自生成一个 remoteSessionId → 后端
 * RemoteControlSessionRegistry 按 sessionId 各建一套 RemoteControlService，
 * 会话之间互不干扰。浏览器里没有这个能力（受弹窗策略与单标签页脚本上下文限制），
 * 所以只在桌面壳渲染。
 */
export function DesktopNewWindowButton({ className }: { className?: string }) {
  const bridge = getDesktopBridge();
  if (!bridge) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        // 走 window.open 由主进程的 setWindowOpenHandler 接住并建新窗口；
        // 主进程若改了策略（返回 deny），这里也只影响新窗口，不影响当前会话。
        window.open(window.location.href, "_blank", "noopener");
      }}
      title="新开一个窗口，可同时控制另一台设备（Ctrl+N）"
      aria-label="新开一个窗口"
    >
      <SquarePlus size={14} aria-hidden />
    </button>
  );
}
