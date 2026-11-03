import { useEffect } from "react";
import { useLocation } from "react-router";

import { useRemoteConnections } from "../remote/remoteConnectionsStore.js";
import { getDesktopBridge } from "./desktopBridge.js";

const APP_NAME = "UU 远程";
const CONTROL_PATH = /^\/devices\/([^/]+)\/control$/;

/**
 * 把「当前这个窗口在控哪台设备」同步到操作系统任务栏。
 *
 * 为什么要单独做这件事：多窗口并排控多台时，操作系统任务栏会按窗口列出任务项，
 * 但每个窗口的标题都来自 `document.title`，远控页一律是「远程控制 | UU Remote」——
 * 任务栏上一排同名条目，用户根本认不出哪一个是哪台机器，"从任务栏切换"就无从下手。
 *
 * 所以远控页把设备名提到最前面（「Office Mac · UU 远程」），设备列表等页面维持原名。
 * 只在 Electron 壳里生效；浏览器标签页不参与，不需要多此一举。
 */
export function useTaskbarTitle(): void {
  const { pathname } = useLocation();
  const connections = useRemoteConnections();
  const controlMatch = CONTROL_PATH.exec(pathname);
  const deviceId = controlMatch ? decodeURIComponent(controlMatch[1]) : "";
  // 连接仓里有名字；刚连上、仓里还没写入时先用兜底文案，不要闪成"远程控制"。
  const deviceName = connections.find((item) => item.deviceId === deviceId)?.deviceName ?? "";

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.setWindowTitle) return;
    if (!deviceId) {
      bridge.setWindowTitle(APP_NAME);
      return;
    }
    bridge.setWindowTitle(deviceName ? `${deviceName} · ${APP_NAME}` : `远程控制 · ${APP_NAME}`);
  }, [deviceId, deviceName]);
}
