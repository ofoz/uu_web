# UU Remote Web 优化分析与改进路径

> 本文档由一次系统性代码审查（子系统测绘 → 多维度评审 → 对抗式验证）整理而成，
> 记录：**已落地的修改**、**确认存在但建议后续处理的问题**、**潜在 bug**、**新功能建议**。
> 原则：不改动原有业务/协议逻辑，除非设计明显不合理。

---

## 一、已完成的修改（低风险，`tsc` 零错误、`npm run build` 通过、cloudflare dry-run 通过）

### 1. 修复「发起控制后画面卡死、只能断开重连」（核心 bug）

**现象**：只观看被控端画面正常；一旦发起控制并交互，几秒后画面卡死，必须断开重连才能恢复。

**根因（输入热路径触发整页重渲染风暴 → 主线程饿死 → 控制心跳被拖垮 → 被控端停推流）**：

- 视频用 `<video srcObject>` 直接播放（渲染在合成线程），主线程卡顿不会直接卡画面 →「画面卡死」只可能是**被控端停止推流**（`videoFlow=transport_stalled`，RTP 收包无增量）。
- 受控端依赖主控端每 100ms 一次的控制心跳 + 及时回复 `EchoRequest` 判定链路存活。
- 每个 `pointermove`（60–120Hz）触发 **3 次全应用树 re-render + 深拷贝**：`recordDebugEvent`→onStateChange、`updateDataChannelState`→onStateChange、controller 的 `setBrowserRemoteState(getState())`。`getState()` 每次深拷贝整个 state，`controlPageProps` 约 90 字段透传 7 个面板。
- 结果：鼠标一动主线程被 React 协调打满 → 100ms 心跳定时器漂移/饿死、`EchoRequest` 响应排队延迟 → 受控端超时判定主控离线 → 停推流。
- 加剧点：`sendEchoHeartbeat` 中 `channel.send` 一旦抛错（背压）就 `stopEchoHeartbeat()` **永久停心跳**。

**修改点（均不改协议/业务）**：

| 文件                          | 改动                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `browserRemoteSession.ts`     | `recordDebugEvent` 只追加环形缓冲，**不再主动推送 React 状态**（调试列表随真实 `setState` 或 1.5s 轮询刷新） |
| `browserRemoteSession.ts`     | `updateDataChannelState` **仅在通道状态真正变化时**才 `setState`                                             |
| `browserRemoteSession.ts`     | `sendEchoHeartbeat` 发送失败时**仅在通道确实不可用时才停心跳**，瞬时背压不再永久杀死心跳                     |
| `useRemoteInputController.ts` | 输入处理集中到独立 hook，热路径不再重复调用 `setBrowserRemoteState`                                          |

**效果**：鼠标移动时整页重渲染从 ~3 次/事件降到 0，主线程腾空，心跳准时；真实 UI 状态变化仍实时，调试面板最长 1.5s 刷新一次。

### 2. UU 代理请求增加上游超时（健壮性）

`backend/src/routes/proxy.ts` 与 `cloudflare/src/index.ts` 的 UU 代理 `fetch` 均加 `AbortController + 30s` 超时，`finally` 清理定时器。原先上游挂起会一直占用连接与最多 10MB body 内存。

### 3. 修复「多路视频时鼠标坐标偏移」（潜在 bug）

`toRemoteMousePosition`（`remoteControlUiModel.ts`）原用 `querySelector("video")` 取 DOM 第一个 `<video>`，多路/多显示器时它未必是当前显示(primary)的那路，会按错误分辨率换算导致坐标偏移。改为优先取标记 `data-active="true"` 的可见画面元素（`RemoteVideoTile` 同步加该标记），找不到再回退第一个。新增 `frontend/tests/remoteControlUiModel.test.ts` 覆盖。单路视频不受影响。

### 4. 清理前端类型债并纳入 CI（工程化）

`vite build` 用 esbuild 跳过类型检查、CI 也从未对前端跑 `tsc`，已积累 **17 处**类型错误，本轮**全部修复**：

- `RTCRtpCodecCapability` → `RTCRtpCodec`（新版 `lib.dom` 重命名，运行时无影响）
- `applySoacPayload` 提前 `if (!data) return` 收窄；`deviceSummary` 入参兜底 `?? {}`；`dropUndefinedFields` 泛型约束 `Record<string,unknown>`→`object`；`switch_network_notify` 的 `transport_type` 显式 cast；`formatRoomRelease*` 接受 `RoomJoinContext`
- 为 `libcurl.js/bundled` 补 `frontend/src/transport/libcurl.d.ts` 声明
- 新增 `frontend` 的 `typecheck` 脚本；`build` 改为 `tsc --noEmit && vite build`；CI 增加 `npm run build -w shared` + `npm run typecheck -w frontend` 关卡

现在 `tsc --noEmit` **零错误**。

### 5. 产品交互改进（专项 UX 审查 → 对抗式验证 → 实施低风险项）

经一次专项交互审查（6 个领域 × 评审 + 对每条发现对抗式验证，确认 45 条、低风险 39 条），本轮实施了高价值且低风险的一批：

**登录**

- 导入不完整登录态不再“假装成功”：用 `validateLoginState` 校验，缺字段抛中文错误（“缺少 令牌/用户 ID/设备 ID”）、不跳转、不提示“已导入”。
- 用独立的 `codeSent` 取代“由 `loginNotice` 推导是否已发码”，修复导入失败后表单错切到“已发码”态。
- 验证码 60s 倒计时 + 禁用（“重新获取(NN s)”），防连点触发上游风控；卸载/登出清理计时。
- 登录表单改为 `<form onSubmit>`，输入框回车即可发码/登录。
- 区号默认值 `86`（输入框真实显示，可改）。

**设备 / 协助**

- 设备列表区分“加载中（正在加载设备…）/ 已加载为空（该类别暂无设备）”。
- 远程协助失败时清除“正在等待对方确认…”残留提示（在 `run` 的 assistance 失败分支统一收口）。

**远控会话**

- 修复全屏后命令栏消失：对包含命令栏的容器 `.control-stage-frame` 请求全屏；按钮随 `fullscreenchange` 在“全屏/退出全屏”切换。
- 主操作按钮下展示 `nextAction.detail`（之前完全丢弃）。
- 返回设备列表 / 退出登录加 `window.confirm` 二次确认（远程协助场景文案区分“取消协助”）；断开按钮加 `title` 说明“断开并释放 UU 房间占用”。
- stage 徽标改用中文（`formatBrowserRemoteStage`：“已授权/协商中/已连接”），并提高徽标字号与对比度。

**剪贴板 / 无障碍 / 响应式**

- 剪贴板读取失败就地反馈到面板（含 HTTPS/权限提示），不再打扰全局错误条。
- 统一错误条 `role="alert" aria-live="assertive"`（登录/设备/控制页）。
- `touch-action: none` 仅在“已解锁输入”时生效，未交互时恢复页面滚动（移动端）。
- 增加 `prefers-reduced-motion` 处理（loading 旋转降级为温和的透明度脉冲）。

测试相应更新：`tests/setup.ts` 默认 stub `window.confirm` 放行 happy-path；登录用例改为校验区号默认 `86`；全屏用例改为对 `.control-stage-frame` 断言。全部 82 前端用例通过。

---

## 二、确认存在、建议后续处理的问题（按价值/风险排序）

### A. 性能

| ID        | 问题                                                      | 位置                                                      | 风险  | 建议                                                                                                                                                                                               |
| --------- | --------------------------------------------------------- | --------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fe-perf-1 | 控制页状态和事件集中在单个 controller                     | `useRemoteControlController.ts` / `RemoteControlPage.tsx` | 中    | ✅ 已按账号、设备、房间、信令、视频、输入、偏好和提示拆成 hook；页面 props 改为 8 组局部接口。主 controller 降到 1181 行、8 个 state、5 个 effect。继续拆成路由级 store 会扩大改动，本轮保留。     |
| fe-perf-3 | 首屏包包含登录后才使用的页面组件                          | `App.tsx`                                                 | 低-中 | ✅ 登录、设备列表和远控页面已用 `React.lazy` 拆包。当前主包 363.53KB（gzip 115.06KB）；进一步拆 controller 依赖需要配合路由级状态调整。                                                            |
| fe-perf-5 | 多路隐藏视频频繁采样                                      | `RemoteVideoTile.tsx`                                     | 中    | ✅ 主画面保持 1s 采样，其余画面降到 5s；只有主画面采样进入远控会话状态计算。                                                                                                                       |
| fe-perf-7 | 轮询重复拉取和处理完整事件数组                            | `useSignalGatewayController.ts`                           | 中    | ✅ Node 与 Cloudflare API 支持 `after` 游标，前端只合并新增事件；建链阶段 600ms、连上后 1.5s。每次启动网关时会同步重置前端游标，避免事件 ID 从 1 重新计数后漏读。原始 SDP/ICE 事件只保留 15 分钟。 |
| be-perf-3 | `recordSignalEvent` 每条消息重建整个数组                  | `remoteControlService.ts:280`                             | 低    | 改 `push` + 超限 `splice`（收益小）                                                                                                                                                                |
| be-perf-4 | Cloudflare DO 每条消息相关子查询 `DELETE ... NOT IN` 裁剪 | `signalSession.ts:541`                                    | 中    | 按阈值批量裁剪                                                                                                                                                                                     |

### B. 工程化

- ~~**前端无类型检查**~~ ✅ **已完成**（第一节第 4 项）。
- ~~**缺 lint/format 基建**~~ ✅ **已完成**：ESLint 与 Prettier 检查均已进入 CI，仓库现有文件已统一格式，`format:check` 可以直接通过。格式改动适合在提交时单独归类，便于审阅。
- **`package.json` 无 `engines`**：建议补 `"engines": { "node": ">=22" }`。
- ~~**Docker 以 root 运行**~~ ✅ runtime 已改用 `node` 用户；Compose 同步启用只读文件系统、临时 `/tmp`、移除 capabilities 和 `no-new-privileges`。
- **`WasmCurlTransport` 当前未接线**：默认仍用 `LocalProxyTransport`。Node 侧 Wisp 已改为默认关闭，仅在 `ENABLE_WISP=true` 时加载。WASM TLS 指纹方案尚未确定，因此没有删除 libcurl，也没有重排生产依赖。
- ~~**预存 flaky 测试**~~ ✅ **已缓解**：`backend/tests/remoteRoutes.test.ts` 偶发 5s 超时（真·挂起，随机命中不同用例）。已验证与本轮改动无关、与 dist 无关；根因是 supertest 为每个请求新建临时 http server 在 vitest worker 池下的时序/端口复用竞争（产品代码无问题）。用 `vitest` 的 `retry: 2` 兜底（连续 10 次全量 backend 测试 0 失败）；真正的功能回归会确定性连续失败、不会被 retry 掩盖。彻底根治可改为每个 describe 复用一个持久 server。
- **测试坏味道（记录）**：`frontend/tests/app.test.tsx` 的 `currentAuthStatus` 被赋值（4 处）却从未被读取——意味着这些“设置登录态”的赋值是 no-op，对应的 auth mock 可能未接线，相关用例可能未真正覆盖目标状态。未擅自删除（属测试意图问题），建议作者确认。

### C. 交互 / UX

> 多数高价值低风险项已在**第一节第 5 项**实施完成。**仍建议后续处理**（多为中等改动或需新增组件/弹窗）：设置抽屉分级 + 人话说明(panels-7)、诊断抽屉去重/分层(panels-2/3/4)、ReadinessStrip 用户化文案(panels-5)、浮层 resize 复位/位置持久化(panels-6)、details 的 Esc/点击外部关闭(a11y-4)、触摸目标 ≥44px(a11y-5)、summary 的 aria-expanded(a11y-6)、解锁输入双入口收敛(control-flow-2)、等待画面超时重试(control-flow-4)、键盘捕获 Esc 释放 + Keyboard Lock(control-flow-6)、命令栏收起/自动隐藏(control-flow-8)、列表内占用者摘要与“接管”角标(devices-5)、不可控/自身设备原因说明(devices-4/7)、导出敏感提示 + 复制按钮(login-7)、导入面板默认展开(login-8)、统一成功提示 toast(feedback-copy-6)。下表为原始问题清单：

| 问题                                                                                                 | 位置                                     | 建议                    | 风险  |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------- | ----- |
| 错误提示多为协议级英文（`signal control ack failed: ...`）直接 `setError`                            | controller 各 `catch`                    | 建错误码→中文文案映射层 | 低-中 |
| 「启用输入控制」按钮与 `nextAction` 的「解锁输入」两个入口同义                                       | `RemoteCommandBar.tsx` / `getNextAction` | 统一入口                | 低    |
| 远控画面默认 `muted`，被控端音频听不到                                                               | `RemoteVideoTile.tsx`                    | 增加静音开关            | 低    |
| 空 favicon                                                                                           | `index.html`                             | 加 SVG 图标             | 极低  |
| 自动重连 effect 把 `autoReconnectStatus` 放进依赖、自身又写它，导致 backoff 多余重建定时器（非 bug） | `useRemoteControlController.ts:897`      | 从依赖移除或用 ref      | 低    |

### D. 安全

- 信令 API 已要求浏览器生成的随机会话凭据。Node 为每个凭据创建独立服务，Cloudflare Durable Object 也按该凭据寻址；不同访问者不会再共用一条信令连接。Node 端最多保留 64 个会话，并回收超过 1 小时未访问的会话。
- 这层随机凭据用于隔离信令状态，不负责确认访问者身份。公网实例仍需放在带身份验证的反向代理或访问网关后面。
- `signalServers` 的协议、主机、端口、数量和超时规则按本轮范围保持原样。
- 正向项：UU API 路径白名单、wisp 目标主机白名单 + 禁私网/环回、令牌脱敏，均已做得不错。

---

## 三、潜在 bug 观察

1. ~~**多路视频鼠标坐标偏移**~~ ✅ **已修复**（第一节第 3 项）。
2. **自动重连定时器多余重建**：见 C 表（功能正确，仅效率瑕疵）。

---

## 四、新功能建议（与产品定位契合）

- **文件传输**：`FILE_DATA_CHANNEL` / `BINARY_DATA_CHANNEL` 已创建但无收发逻辑，可补文件投送。
- **连接质量 HUD**：已有丰富诊断数据（FPS、丢帧、RTT、码率、连接路径），可做画面角落实时浮层。
- **画质/帧率预设、深色模式、快捷键帮助面板、会话录制**：常见远控增强项。

---

## 五、验证状态

- `npx tsc --noEmit`（frontend）：**零错误**。
- `npm run build`：shared/backend `tsc` 通过、frontend `tsc --noEmit && vite build` 通过。
- `npm run check:cloudflare`：Wrangler 4.112.0 dry-run 通过。
- 测试：shared 57 项、backend 43 项、frontend 90 项，共 190 项通过。
- Docker 镜像可在非 root、只读文件系统和最小权限参数下启动；Wisp 默认关闭，哈希资源返回 Brotli 与 immutable 缓存。
- 本轮没有调整 UU 上游协议、`signalServers` 规则和登录产品流程。
