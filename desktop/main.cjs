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

// 只允许一个窗口；重复点击图标时把已有窗口提到前面。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
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

  mainWindow.once("ready-to-show", () => {
    // maximize 而不是 fullscreen：满工作区、dock 仍在，正是用户要的形态。
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 双击拖拽区、系统快捷键、窗口边缘拖拽都会改变最大化状态，
  // 主动推给页面，窗口按钮的图标才能跟得上。
  const pushWindowState = () => {
    mainWindow?.webContents.send("uurc:window-state-changed", {
      maximized: mainWindow?.isMaximized() ?? false,
    });
  };
  mainWindow.on("maximize", pushWindowState);
  mainWindow.on("unmaximize", pushWindowState);

  // 站内跳 GitHub 之类的链接交给系统浏览器，壳里不新开窗口。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void mainWindow.loadURL(APP_URL);
}

ipcMain.on("uurc:window-minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("uurc:window-toggle-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.on("uurc:window-close", () => {
  mainWindow?.close();
});

ipcMain.handle("uurc:window-state", () => ({
  maximized: mainWindow?.isMaximized() ?? false,
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
