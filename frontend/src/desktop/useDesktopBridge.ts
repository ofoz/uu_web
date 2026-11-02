import { useEffect, useState } from "react";

import { getDesktopBridge, type DesktopBridge } from "./desktopBridge.js";

/**
 * 在 effect 里读取桌面壳桥接，保证 SSR 与首帧 hydration 一致（服务端永远拿 null）。
 */
export function useDesktopBridge(): DesktopBridge | null {
  const [bridge, setBridge] = useState<DesktopBridge | null>(null);

  useEffect(() => {
    setBridge(getDesktopBridge());
  }, []);

  return bridge;
}
