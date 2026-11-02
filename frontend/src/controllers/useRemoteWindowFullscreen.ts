import { useCallback, useState } from "react";

export interface RemoteWindowFullscreen {
  /** 布局是否按全屏渲染（画面撑满窗口可用区域）。 */
  isFullscreen: boolean;
  toggle: () => void;
  exit: () => void;
}

/**
 * 远控页的「全屏」只做布局：画面在**最大化窗口内**铺满，不进独占全屏。
 *
 * 为什么不直接用 HTML5 requestFullscreen：
 * 1. 它能去掉系统标题栏，但会连带盖住 DDE 的系统任务栏——用户明确要求任务栏留着；
 * 2. 全屏态下 Esc 会被浏览器强制用于退出全屏，而远控里 Esc 需要发给被控端。
 *
 * 为什么不去掉窗口装饰：实测 deepin-kwin（DDE 25）对运行时的
 * `_MOTIF_WM_HINTS`（decorations=0）不重新计算，unmap/re-map 后
 * `_NET_FRAME_EXTENTS` 仍是 `0,0,50,0`；最大化状态下窗口移动请求也被拒绝。
 * 所以「无标题栏 + 保留系统任务栏」在纯 Web + KWin 下做不到——那条 50px 现在由
 * `desktop/` 里的 Electron 壳（frameless 窗口）负责，这里的全屏只剩布局语义：
 * 把画面铺满窗口、并把顶栏/工具栏交给自动隐藏。
 */
export function useRemoteWindowFullscreen(): RemoteWindowFullscreen {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggle = useCallback(() => {
    setIsFullscreen((current) => !current);
  }, []);

  const exit = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  return { isFullscreen, toggle, exit };
}
