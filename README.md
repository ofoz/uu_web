# uu_web · UU 远程网页主控端

[![CI](https://github.com/ofoz/uu_web/actions/workflows/ci.yml/badge.svg)](https://github.com/ofoz/uu_web/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

在浏览器里操控你的 UU 远程设备。基于 [iola1999/uurc-web](https://github.com/iola1999/uurc-web)（MIT）二次开发，面向 Linux 桌面（Deepin / Debian 系）做了本地化部署与交互改进。

UU 官方只提供 Windows / macOS 客户端。如果你主要在 Linux 上工作，又需要偶尔去操作另一台机器（家里 Windows 主机、公司电脑、放机房的笔记本），本项目把主控端搬到浏览器里：本机起一个 Node 服务，打开 `http://127.0.0.1:8787`，短信登录 UU 账号、选设备、连上去。视频、音频、键鼠、剪贴板走 WebRTC，账号凭证不出本机。

## 它是什么，不是什么

|            | **uu_web**（本项目）         | uuway                                                            |
| ---------- | ---------------------------- | ---------------------------------------------------------------- |
| 角色       | **主控端**：由本机去控制别人 | **被控端**：让别的机器来控制本机                                 |
| 形态       | 本地 Node 服务 + 浏览器页面  | UU 官方 Windows host 的 Linux 封装（Wine / Xvfb / Wayland 采集） |
| 对你的意义 | Linux 当"操作台"             | Linux 当"被操作的那台"                                           |

两者只共用同一个 UU 账号和 UU 云服务，代码、进程、端口互不相干。本仓库只做前者。

## 功能

- 短信验证码登录；登录态可导入 / 导出，换机器不用重新收码
- 设备列表、多显示器选择
- 远程画面、声音、键鼠输入、剪贴板双向同步
- 连接诊断（ICE 候选链路、码率、丢包）、断线自动恢复
- 协作 / 接管（对方确认后接手会话）
- 账号管理

## 相对上游的改动

| 改动                           | 位置                                                                                                      | 说明                                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全屏时状态徽标与控制栏自动隐藏 | `frontend/src/components/useFullscreenChromeAutoHide.ts`、`RemoteControlPage.tsx`、`RemoteCommandBar.tsx` | 进全屏先显示 2.2s 再淡出；鼠标触顶或移回工具栏附近唤出；画面中央操作不唤出（远控时鼠标一直在动，否则等于永不隐藏）。Esc 只在"仅查看"态退全屏，已解锁输入时仍原样发给被控端 |
| 直连优化：补双栈 STUN          | `shared/src/streamer/signalControl.ts`                                                                    | 上游只用 UU 下发的 ICE 服务器，缺少 IPv6 STUN，导致 IPv6 可用时也拿不到 srflx 候选、只能走中转。现追加 Google / 小米公共 STUN，`?stun=off` 可关闭，`forceRelay` 时跳过     |
| 诊断里标注候选地址族           | `frontend/src/remote/remoteControlPresentation.ts`                                                        | 候选链路显示为 `srflx v6` / `host v4`，便于判断到底走的是哪条路                                                                                                            |
| 品牌标识                       | `frontend/public/brand/`、`favicon.svg`、`BrandLogo.tsx`、`site.webmanifest`                              | 蓝色渐变圆角底 + 深色远控画面 + 白色指针；≤32px 另用简化稿（去支架、放大屏幕与指针）                                                                                       |
| 修复状态徽标吞点击             | `frontend/src/styles/stage.css`                                                                           | 补 `pointer-events: none`                                                                                                                                                  |
| 修复工具栏拖动后位置错乱       | `frontend/src/styles/control-command-bar.css`                                                             | 隐藏态去掉 `transform`，避免与 fixed 坐标叠加二次平移                                                                                                                      |
| 本地构建配置                   | `frontend/vite.local.config.ts`                                                                           | 关闭 `publicDir` 自动复制，静态资源用 `cp` 手动拷贝，绕开部分环境下 Node `copyFile` 被拦截的问题                                                                           |
| 服务管理脚本                   | `scripts/uurc-web.sh`                                                                                     | `start/stop/restart/status/app/open`；`app` 用独立窗口打开（Chrome app 模式，无地址栏与标签页），其余只监听 `127.0.0.1`                                                    |

## 快速开始（Linux 本地）

要求 Node.js 22+、npm 10+。

```bash
git clone https://github.com/ofoz/uu_web.git
cd uu_web
npm ci
npm run build          # shared → backend → frontend，顺序不能反
```

启动：

```bash
./scripts/uurc-web.sh start     # 后台运行，日志在 ~/.local/state/uurc-web/
./scripts/uurc-web.sh app       # 起服务并用独立窗口打开（推荐日常使用）
./scripts/uurc-web.sh open      # 起服务并在默认浏览器的标签页里打开
./scripts/uurc-web.sh status
./scripts/uurc-web.sh stop
```

或者前台直接跑：

```bash
node backend/dist/index.js      # 默认 0.0.0.0:8787，生产环境建议 HOST=127.0.0.1
```

后端会把 `frontend/dist` 一起托管，所以 `8787` 一个端口就是完整应用，不需要额外的 nginx。

### 作为桌面应用运行（独立窗口）

`app` 子命令会拉起**独立的桌面窗口**：没有地址栏、没有标签页、没有系统标题栏，任务栏上是它自己的图标，默认最大化但**保留系统任务栏**（不是独占全屏）。

```bash
./scripts/uurc-web.sh app
```

窗口由 `desktop/` 下的 **Electron 壳**提供（`frame: false` 的无边框窗口）。为什么需要壳：在 KDE KWin（Deepin 25 的窗管）下，纯网页做不到"去掉标题栏但保留任务栏"——`_MOTIF_WM_HINTS` 写了不生效，最大化窗口也拒绝移动，实测三条路都走不通；而 HTML5 全屏能去掉标题栏，代价是把任务栏一起盖住。只有能自建 frameless 窗口的壳能同时满足这两个条件。

壳的职责只有窗口控制，不碰业务逻辑：

- 页面仍由本地后端托管（`http://127.0.0.1:8787/`），可用 `UURC_DESKTOP_URL` 覆盖
- 窗口按钮（最小化 / 最大化 / 关闭）通过 `preload.cjs` 的 `contextBridge` 暴露给页面，`nodeIntegration` 关闭、`sandbox` 开启
- 页面顶栏与左侧栏是拖动把手（`-webkit-app-region: drag`），其中的可点元素显式改回 `no-drag`
- 单实例锁：重复点图标只把已有窗口提到前面

安装壳运行时（约 100 MB，不进 `package.json`，避免 CI 白下载）：

```bash
cd <项目目录>
TMPDIR=$HOME/.cache/npm-tmp \
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
npm i -D electron@33 --no-audit --no-fund
```

`TMPDIR` 有必要指定：部分发行版 `/tmp` 是几十 MB 的 tmpfs，解压 100 MB 二进制会直接失败。

找不到 Electron 时脚本会**自动退回 Chrome app 模式**（`--app=URL --class=uurc-web`）：仍是独立窗口，但会保留系统标题栏。退回分支的要点：

- `--class=uurc-web` 让 `WM_CLASS` 变成 `uurc-web`，桌面环境据此匹配 `.desktop` 里的图标（配合 `StartupWMClass=uurc-web`）
- `--user-data-dir=~/.local/share/uurc-web/app-profile` 用**独立配置目录**，与日常浏览的 Chrome 完全隔离
- 已开过窗口时用 `xdotool` 把已有窗口切到前台

想让它出现在应用菜单里，把仓库里的 `packaging/uurc-web.desktop` 复制到 `~/.local/share/applications/`，并把 `Exec=` 和 `Icon=` 改成自己的路径即可。

### 环境变量

| 变量                    | 默认                        | 说明                                                  |
| ----------------------- | --------------------------- | ----------------------------------------------------- |
| `HOST`                  | `0.0.0.0`                   | 监听地址。只给本机用就设 `127.0.0.1`                  |
| `PORT`                  | `8787`                      | 监听端口                                              |
| `ENABLE_DIAGNOSTICS`    | `true`                      | 设为 `false` 关闭诊断路由                             |
| `ENABLE_WISP`           | `false`                     | 可选 WASM curl 传输，仅测试用                         |
| `UURC_BACKEND_LOG_PATH` | `/tmp/uurc-web-backend.log` | 后端日志路径（脚本会指到 `~/.local/state/uurc-web/`） |

### Docker

```bash
docker compose up -d
```

### Cloudflare Worker

```bash
npx wrangler login
npm run deploy:cloudflare
```

Worker + Durable Object 一并承担静态托管、UU API 转发与信令网关，详见 `cloudflare/README.md`。这条路径不会禁用 P2P 直连。

## 直连还是中转？

连接方式由 ICE 协商决定，浏览器会在 host / srflx / relay 三类候选里挑一对能打通的：

- **host** —— 局域网点对点，最快
- **srflx** —— 双方公网地址，NAT 打洞直连
- **relay** —— 走 UU 中转，稳但多一跳

看当前走的是哪条：远程页面 → 状态面板 → 连接质量 → 候选链路，会显示成 `srflx v6 / srflx v6` 这样的形式。出现 `relay` 说明直连没打通，先按这个顺序排查：

1. 双方是否在同一局域网？同一网段却走中转，多半是客户端隐藏了本机地址。
2. Chrome 会用 mDNS 混淆 host 候选（`xxx.local`）。临时关掉可暴露真实内网 IP，代价是局域网内可见性变高：
   ```bash
   google-chrome --disable-features=WebRtcHideLocalIpsWithMdns
   ```
3. 网络是纯 IPv6 还是双栈？纯 IPv6 环境下必须拿到 v6 srflx，本项目已补双栈 STUN；若被 UU 的 ICE 配置覆盖，检查 `?stun=off` 是否被误用。

更细的排查思路见 `docs/remote-video-troubleshooting.zh-CN.md`。

## 连接后的实时指标

顶栏「已连接」后面挂三枚胶囊，全部复用现有 `getStats` 采样，不额外开统计通道：

| 胶囊 | 示例       | 来源                                             |
| ---- | ---------- | ------------------------------------------------ |
| 时长 | `01:24:07` | 首次连上时记录时间戳，`restart_ice` 重协商不归零 |
| 延迟 | `32 ms`    | 连接质量面板的 RTT 采样                          |
| 帧率 | `28 fps`   | `framesPerSecond` 或解码帧增量                   |

采样未出数时显示 `—`；延迟/帧率随质量评级变色（正常绿、卡顿黄、断开红）。

## 全屏与沉浸模式

连接成功后顶栏、状态徽标、工具栏统一进入自动隐藏：先亮 2.2 秒，然后淡出，鼠标靠近再唤出。

连接控制栏（仅查看/控制中、音量、填充画面、全屏、快捷键）**常驻在顶栏右侧**，不浮在画面上，也不再支持拖动——把画面完整让给被控端，同时避免它压住远端任务栏。

- 唤出：鼠标顶到屏幕最上方，或从远处移进顶栏所在区域（边缘触发，停在原地不会反复唤醒）
- 保持：鼠标压在悬浮层上、拖动过程中都不计时隐藏
- 退出：Esc。**仅查看**状态下 Esc 退出全屏；已解锁输入时 Esc 会发给被控端（否则远端关不掉弹窗）
- 窗口较窄时，工具栏先把次要按钮的文字收成图标（≤1680px），再收起音量滑杆（≤1280px），保证「会话面板」「断开」不被挤出顶栏

顶栏是全屏时的浮层（`z-index` 高于铺满视口的画面容器），否则全屏下会被画面完全盖住、点不到返回和断开。

## 断开与画面源

- 顶栏「断开」是明确的结束动作：停掉信令网关、释放房间占用、关闭 WebRTC 会话，然后**直接回到设备列表**，不再二次确认。左上角返回箭头在仍有活动会话时才会弹「将断开当前远控」确认。
- 远控画面不再叠状态角标；被控端在 SDP 里挂出的多路 video m-line 中，**8 秒宽限期内始终没有像素**的那几路（多为没启用的副屏/摄像头）会在「画面源」里折叠成 `+N 路无画面`，点开仍可查看；之后真出了画面会自动回到列表。主画面不会落在这些静默源上。

## 目录结构

```
shared/     协议编解码、校验、房间与会话模型（@uurc/shared，约 30 个子路径导出）
backend/    Express 网关：UU API 代理、信令、静态托管（@uurc/backend）
frontend/   React 19 + react-router 7 + Vite SPA（@uurc/frontend）
cloudflare/ Worker 入口 + RemoteSignalSession Durable Object，非 workspace，用独立 vitest 配置
docs/       排查文档
scripts/    本地服务管理脚本
```

`shared` 必须先构建：`backend` / `frontend` 通过 `@uurc/shared/*` 引用 `shared/dist/*.js`，改了 `shared` 不重建会拿到旧产物。

## 常用命令

```bash
npm run dev            # 同时起 shared 监听、backend:8787、vite:5173（/api 代理到 8787）
npm run build          # 全量构建
npm test               # shared + backend + frontend + cloudflare 四套测试
npm run lint           # ESLint
npm run format         # Prettier（printWidth 120，双引号）
npm run typecheck -w frontend
```

单跑某个测试文件：

```bash
cd frontend && npx vitest run tests/browserRemoteSession.negotiation.test.ts
npx vitest run --config cloudflare/vitest.config.ts
```

## 排错

**构建时报 `EPERM: operation not permitted, copyFile`**
某些受限环境会拦截 Node 的 `copyFile`。用本地配置构建：

```bash
cd frontend
npx vite build --config vite.local.config.ts
cp -r public/. dist/
npx vite build --config vite.local.config.ts --ssr src/entry-server.tsx --outDir dist/prerender
node scripts/prerender.mjs
```

**改了前端但页面没变**
后端实时读盘，不用重启服务；浏览器 `Ctrl+Shift+R` 硬刷即可。`_headers` 里静态资源是长缓存，普通刷新可能命中旧的 hash 资源。

**桌面图标还是旧的**
Deepin 启动器有图标缓存，改完 `~/.local/share/icons/hicolor/*/apps/` 后注销重登一次。

**前端集成测试整包跑偶发失败，单跑全绿**
`tests/app.*.test.tsx` 并行跑时会有环境抖动，单独跑可复现真实结果。

**被控端被连接时怎么防止旁人偷看**
这是被控端客户端的设置，不在本项目里：被控端 UU → 控制中心 → 安全 → 被控端防窥模式，可选"关闭显示屏"（物理熄屏，最彻底）或"隐私屏保"。被控时按 `Ctrl+Alt+P` 可临时解除。

## 安全

登录态存在当前浏览器，UU API 请求会经过你部署的这个网关。**只要不是你自己控制的实例，就不要在上面输入短信验证码或导入凭证**——网关运营者在技术上可以看到经过它的请求。自建时建议 `HOST=127.0.0.1`，需要公网访问就套一层带认证的反向代理（Cloudflare Access、Authelia 之类）。

公开日志和截图里请抹掉验证码、凭证、token、设备 ID、房间号和网络地址。完整信任模型见 [SECURITY.md](SECURITY.md)。

## 许可与致谢

[MIT](LICENSE)。上游项目 [iola1999/uurc-web](https://github.com/iola1999/uurc-web)，版权归原作者所有；本仓库的修改同样以 MIT 发布。上游 Cloudflare 部署架构参考了 [AssppWeb](https://github.com/Lakr233/AssppWeb)。

与网易 UU 官方无关，未获其授权或背书。使用时请遵守 UU 远程的服务条款。
