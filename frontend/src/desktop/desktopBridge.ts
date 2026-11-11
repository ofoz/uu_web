import type { LoginState } from "@uurc/shared/authState";

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
  /** 把标题写到操作系统任务栏，让多窗口在任务栏上能按设备名区分。 */
  setWindowTitle?: (title: string) => void;
  /** 从桌面壳持久化文件同步读取登录凭证，弥补 Chromium 存储未及时刷盘或源变更的场景。 */
  loadLoginState?: () => Partial<LoginState> | null;
  /** 把登录凭证同步落盘到桌面壳 userData 目录。 */
  saveLoginState?: (state: Partial<LoginState>) => boolean;
  /** 退出登录时同步清除桌面壳保存的凭证文件。 */
  clearLoginState?: () => boolean;
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
