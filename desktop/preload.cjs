// 通过 contextBridge 只暴露窗口控制、任务栏标题与本地登录态持久化，其余业务能力一律不给。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("uurcDesktop", {
  isDesktop: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send("uurc:window-minimize"),
  toggleMaximize: () => ipcRenderer.send("uurc:window-toggle-maximize"),
  close: () => ipcRenderer.send("uurc:window-close"),
  getWindowState: () => ipcRenderer.invoke("uurc:window-state"),
  /**
   * 同步窗口标题到操作系统任务栏。
   *
   * 多窗口并排控多台时，任务栏上若全叫「UU 远程」就分不清谁是谁；
   * 页面把当前正在控的设备名传下来，任务栏就能一眼区分。
   * frameless 窗口不显示标题栏，这里只影响任务栏/Alt-Tab 的显示。
   */
  setWindowTitle: (title) => ipcRenderer.send("uurc:window-title", String(title ?? "")),
  // 同步读写主进程落盘的登录态，防止关窗/重启或端口变动导致 localStorage 丢失后重新登录。
  loadLoginState: () => ipcRenderer.sendSync("uurc:login-state-load"),
  saveLoginState: (state) => ipcRenderer.sendSync("uurc:login-state-save", state),
  clearLoginState: () => ipcRenderer.sendSync("uurc:login-state-clear"),
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
