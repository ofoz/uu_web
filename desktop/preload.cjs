// 只暴露窗口控制这一件事，业务能力一律不给。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("uurcDesktop", {
  isDesktop: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send("uurc:window-minimize"),
  toggleMaximize: () => ipcRenderer.send("uurc:window-toggle-maximize"),
  close: () => ipcRenderer.send("uurc:window-close"),
  getWindowState: () => ipcRenderer.invoke("uurc:window-state"),
  // 返回取消订阅函数，组件卸载时解绑，避免热重载后重复注册。
  onWindowStateChange: (handler) => {
    const listener = (_event, state) => handler(state);
    ipcRenderer.on("uurc:window-state-changed", listener);
    return () => ipcRenderer.removeListener("uurc:window-state-changed", listener);
  },
});

// frameless 窗口没有系统标题栏，页面顶栏要充当拖拽区。
// 用 html 上的类名给 CSS 挂 `-webkit-app-region`，浏览器里访问时不会被加上。
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("uurc-desktop");
});
