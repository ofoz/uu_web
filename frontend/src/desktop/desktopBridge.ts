/**
 * Electron 壳（desktop/preload.cjs）注入的最小桥接。
 * 浏览器里访问时它不存在，所有能力都要按"可能没有"来写。
 */
export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  getWindowState: () => Promise<{ maximized: boolean }>;
  onWindowStateChange: (handler: (state: { maximized: boolean }) => void) => () => void;
}

declare global {
  interface Window {
    uurcDesktop?: DesktopBridge;
  }
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.uurcDesktop ?? null;
}
