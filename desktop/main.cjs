// UU 远程桌面壳（Electron）
//
// 目的只有一个：拿到一个**无系统标题栏**的窗口，同时保持"最大化"而不是独占全屏，
// 这样 DDE 的系统任务栏仍然可见。纯 Web + KWin 做不到这件事（实测 _MOTIF_WM_HINTS
// 被忽略、最大化态窗口无法移动），只能用能自建 frameless 窗口的壳。
//
// 页面本身仍然是本地后端托管的同一套前端（默认 http://127.0.0.1:8787/），
// 壳不碰业务逻辑，只补窗口控制（最小化 / 最大化 / 关闭）与外部链接处理。
const path = require("node:path");

const { app, BrowserWindow, ipcMain, shell } = require("electron");

const APP_URL = process.env.UURC_DESKTOP_URL || "http://127.0.0.1:8787/";
const APP_TITLE = "UU 远程";

// 让任务栏/坞栏按应用名匹配到 .desktop 里的 StartupWMClass。
app.setName("uurc-web");

let mainWindow = null;

// 多窗口：每个窗口是独立的 BrowserWindow（独立 webContents），sessionStorage
// 天然隔离，前端各拿一个 remoteSessionId，后端对应各自的 RemoteControlService，
// 因此可以同时控多台设备。主窗口编号 0，其它窗口在主窗口关闭时一起收掉。
const windows = new Set();
const MAX_WINDOWS = 4;

// 只允许一个进程实例；重复点击图标时把已有窗口提到前面。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const focusTarget = [...windows].find((win) => !win.isDestroyed()) ?? null;
    if (!focusTarget) return;
    if (focusTarget.isMinimized()) focusTarget.restore();
    focusTarget.focus();
  });
}

function createWindow() {
  if (windows.size >= MAX_WINDOWS) return null;

  const win = new BrowserWindow({
    // 首窗最大化；后续窗口错开一点，避免完全叠在一起看不出开了几个。
    width: windows.size === 0 ? 1280 : 1160,
    height: windows.size === 0 ? 820 : 760,
    minWidth: 960,
    minHeight: 600,
    show: false,
    // 关键：不要系统标题栏/边框，标题栏由页面顶栏自己画。
    frame: false,
    title: APP_TITLE,
    backgroundColor: "#0b0b0c",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  windows.add(win);
  const isFirst = windows.size === 1;
  if (isFirst) mainWindow = win;

  win.once("ready-to-show", () => {
    // maximize 而不是 fullscreen：满工作区、dock 仍在，正是用户要的形态。
    // 只有首窗最大化，后续窗口保留普通尺寸，方便并排看两台机器。
    if (isFirst) win.maximize();
    win.show();
  });

  win.on("closed", () => {
    windows.delete(win);
    if (win === mainWindow) {
      mainWindow = null;
      // 主窗一关就整体退出，不留一堆看不出归属的孤儿窗口。
      for (const other of windows) {
        if (!other.isDestroyed()) other.close();
      }
    }
  });

  // Ctrl/⌘+N 再开一个窗口。
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = String(input.key || "").toLowerCase();
    const mod = process.platform === "darwin" ? input.meta : input.control;
    if (mod && key === "n") {
      event.preventDefault();
      createWindow();
    }
  });

  // 窗口状态推送要精确发到发起操作的那个窗口，不能用全局 mainWindow。
  win.on("maximize", () => pushWindowState(win));
  win.on("unmaximize", () => pushWindowState(win));

  // 站内跳 GitHub 之类的链接交给系统浏览器，壳里不新开渲染进程。
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void win.loadURL(APP_URL);
  return win;
}

function pushWindowState(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("uurc:window-state-changed", { maximized: win.isMaximized() });
}

/** 把 IPC 事件路由回它所属的窗口，避免多窗口时按钮操作串到别的窗口上。 */
function senderWindow(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win && !win.isDestroyed() ? win : null;
}

ipcMain.on("uurc:window-minimize", (event) => {
  senderWindow(event)?.minimize();
});

ipcMain.on("uurc:window-toggle-maximize", (event) => {
  const win = senderWindow(event);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on("uurc:window-close", (event) => {
  senderWindow(event)?.close();
});

ipcMain.handle("uurc:window-state", (event) => ({
  maximized: senderWindow(event)?.isMaximized() ?? false,
}));

void app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
