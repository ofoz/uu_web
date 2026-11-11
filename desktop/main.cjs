// UU 远程桌面壳（Electron）
//
// 目的只有一个：拿到一个**无系统标题栏**的窗口，同时保持"最大化"而不是独占全屏，
// 这样 DDE 的系统任务栏仍然可见。纯 Web + KWin 做不到这件事（实测 _MOTIF_WM_HINTS
// 被忽略、最大化态窗口无法移动），只能用能自建 frameless 窗口的壳。
//
// 页面本身仍然是本地后端托管的同一套前端：
// - 脚本/开发模式默认连 http://127.0.0.1:8787/（或 UURC_DESKTOP_URL）
// - 打包安装模式由主进程拉起内置 backend-server.mjs（随机本地空闲端口）
// 壳仅负责窗口控制、外部链接跳转，以及把登录态可靠持久化到固定 userData 目录。
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } = require("electron");

const { createDesktopLoginStateStore, resolveInitialUrl } = require("./loginStatePersistence.cjs");

// 开发/脚本模式由外部提供 URL；打包安装后的程序没有外部服务，由本进程自己拉起后端。
let APP_URL = process.env.UURC_DESKTOP_URL || null;
const APP_TITLE = "UU 远程";

let backendProcess = null;

function stateDir() {
  const base = process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(base, "uurc-web");
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function waitForBackend(url, child, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let settled = false;
    let retryTimer = null;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      child.off("exit", onEarlyExit);
      child.off("error", onChildError);
      if (error) reject(error);
      else resolve();
    };

    const onEarlyExit = (code, signal) => {
      finish(new Error(`内置后端提前退出（code=${code ?? "null"}, signal=${signal ?? "none"}）`));
    };

    const onChildError = (error) => {
      finish(error);
    };

    child.once("exit", onEarlyExit);
    child.once("error", onChildError);

    const retry = () => {
      if (settled) return;
      if (Date.now() > deadline) {
        finish(new Error("后端启动超时"));
        return;
      }
      retryTimer = setTimeout(tick, 200);
    };

    const tick = () => {
      if (settled) return;
      const req = http.get(`${url}api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) finish();
        else retry();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => req.destroy());
    };

    tick();
  });
}

async function startBackend() {
  const appRoot = app.getAppPath();
  const backendEntry = path.join(appRoot, "backend-server.mjs");
  if (!fs.existsSync(backendEntry)) {
    throw new Error(`找不到内置后端入口: ${backendEntry}`);
  }
  const logPath = path.join(stateDir(), "app.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const port = await findFreePort();
  const child = spawn(process.execPath, [backendEntry], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOST: "127.0.0.1",
      PORT: String(port),
      UURC_BACKEND_LOG_PATH: logPath,
    },
    stdio: "ignore",
  });
  backendProcess = child;
  child.on("exit", () => {
    if (backendProcess === child) backendProcess = null;
  });
  const url = `http://127.0.0.1:${port}/`;
  await waitForBackend(url, child);
  return url;
}

// 让任务栏/坞栏按应用名匹配到 .desktop 里的 StartupWMClass，
// 并固定独立的 userData 目录，确保 localStorage 与凭证文件不因未打包路径或随机端口而漂移/丢失。
app.setName("uurc-web");
const USER_DATA_DIR = path.join(app.getPath("appData"), "uurc-web");
app.setPath("userData", USER_DATA_DIR);

const loginStateStore = createDesktopLoginStateStore({
  filePath: path.join(USER_DATA_DIR, "login-state.json"),
  safeStorage,
});

let mainWindow = null;

// 多窗口：每个窗口是独立的 BrowserWindow（独立 webContents），sessionStorage
// 天然隔离，前端各拿一个 remoteSessionId，后端对应各自的 RemoteControlService，
// 因此可以同时控多台设备。主窗口编号 0，其它窗口在主窗口关闭时一起收掉。
const windows = new Set();
const MAX_WINDOWS = 4;

// 只允许一个进程实例；重复点击图标时把已有窗口提到前面。
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const focusTarget = [...windows].find((win) => !win.isDestroyed()) ?? null;
    if (!focusTarget) return;
    if (focusTarget.isMinimized()) focusTarget.restore();
    focusTarget.focus();
  });
}

function flushChromiumStorage() {
  if (!app.isReady()) return;
  try {
    session.defaultSession.flushStorageData();
  } catch {
    // 退出或关闭期间的刷盘异常不应阻断窗口关闭。
  }
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

  // 关闭窗口前主动把 Chromium 的 localStorage 缓冲刷盘，避免刚登录就关闭软件导致丢态。
  win.on("close", flushChromiumStorage);

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

  void win.loadURL(resolveInitialUrl(APP_URL, loginStateStore.load()));
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

function getAppOrigin() {
  if (!APP_URL) return "";
  try {
    return new URL(APP_URL).origin;
  } catch {
    return "";
  }
}

/** 仅允许托管前端同源页面读写本地保存的登录态。 */
function isAuthorizedAppSender(event) {
  const win = senderWindow(event);
  if (!win || !windows.has(win)) return false;
  const appOrigin = getAppOrigin();
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!appOrigin || !senderUrl) return false;
  try {
    return new URL(senderUrl).origin === appOrigin;
  } catch {
    return false;
  }
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

/**
 * 任务栏标题同步。
 *
 * 多窗口各控一台时，操作系统任务栏默认把每个窗口都显示成「UU 远程」，
 * 用户没法从任务栏认出哪一个是哪台设备 —— 这直接掐死了"从任务栏切换"这件事。
 * 页面把「设备名 · UU 远程」传上来，这里写到窗口标题上；
 * frameless 窗口没有标题栏，改标题只影响任务栏与 Alt-Tab 的显示，不破坏外观。
 */
ipcMain.on("uurc:window-title", (event, title) => {
  const win = senderWindow(event);
  if (!win) return;
  const next = String(title ?? "").trim();
  if (!next) return;
  win.setTitle(next);
});

ipcMain.handle("uurc:window-state", (event) => ({
  maximized: senderWindow(event)?.isMaximized() ?? false,
}));

ipcMain.on("uurc:login-state-load", (event) => {
  if (!isAuthorizedAppSender(event)) {
    event.returnValue = null;
    return;
  }
  try {
    event.returnValue = loginStateStore.load();
  } catch {
    event.returnValue = null;
  }
});

ipcMain.on("uurc:login-state-save", (event, state) => {
  if (!isAuthorizedAppSender(event)) {
    event.returnValue = false;
    return;
  }
  try {
    event.returnValue = Boolean(loginStateStore.save(state));
  } catch {
    event.returnValue = false;
  }
});

ipcMain.on("uurc:login-state-clear", (event) => {
  if (!isAuthorizedAppSender(event)) {
    event.returnValue = false;
    return;
  }
  try {
    event.returnValue = loginStateStore.clear();
  } catch {
    event.returnValue = false;
  }
});

void app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  if (!APP_URL && app.isPackaged) {
    try {
      APP_URL = await startBackend();
    } catch (error) {
      dialog.showErrorBox("UU 远程启动失败", String(error?.message ?? error));
      app.quit();
      return;
    }
  }
  APP_URL ??= "http://127.0.0.1:8787/";
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", flushChromiumStorage);

app.on("will-quit", () => {
  backendProcess?.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
