# 远控画面冻结排查

本文适用于远控画面卡住、鼠标和键盘输入仍可正常使用的情况。

## 当前判断

已分析的样本来自 macOS Edge 150。会话使用 H.264，分辨率为 2560×1440，最高约 60 fps。连接为 UDP
直连，往返时延约 12～28 ms，`packetsLost` 始终为 0。浏览器使用的解码器是
`ExternalDecoder (VideoToolboxVideoDecoder)`。

画面冻结时有以下特征：

- RTP 包和字节数继续增长，音频、输入和数据通道仍可使用。
- `framesDecoded` 停止增长，`framesDropped` 突增 14～15。
- `pliCount` 增长到约每秒 5 次，`keyFramesDecoded` 停在 1。
- 重新建立连接可以短暂恢复，随后可能再次冻结。

这些数据把排查范围收窄到 Chromium 的 H.264 组帧、VideoToolbox 解码和解码后的输出队列。网络和信令故障的
可能性较低。

关闭 Edge 图形加速后暂未复现。结合日志和公开问题记录，图形加速或硬件视频解码路径参与故障的可能性约为
80%～90%，目前按 85% 估计。Edge 或 VideoToolbox 单方缺陷的可能性约为 60%～75%；设备端 H.264
码流中的 IDR、SPS/PPS 或分包方式也可能触发兼容问题。

观察时间会影响这个判断：

- 关闭图形加速后只经过较短时间，估计为 70%～80%。
- 运行时间超过原平均复现时间的 5～10 倍，并测试至少 100 次回车仍然稳定，可以按 90%～95% 估计。

目前没有找到明确标注 Edge 150 的同类公开问题。

## 公开资料对照

- [Strange h264 decoder freeze in Chromium + macOS](https://groups.google.com/g/discuss-webrtc/c/RlgG_jJRggo)
  记录了高度相似的 WebRTC 故障：PLI 约每秒 6 次、关键帧无法解码、画面永久冻结，重建 P2P 后恢复。
- [Chromium Issue 41443929](https://issues.chromium.org/issues/41443929)
  记录了 macOS WebRTC 接收 H.264 时的永久停帧、PLI 持续增长和重连恢复；关闭硬件加速后恢复正常。问题因
  批量清理标记为 Obsolete，记录中没有修复提交。该测试主动制造了丢包，和当前样本条件有差异。
- [Chromium Issue 40877563](https://issues.chromium.org/issues/40877563)
  记录了 Apple Silicon 开启硬件加速后视频播放失败。关闭硬件视频解码后，解码器从 VDA 切换到 FFmpeg，
  播放恢复。
- [Chromium Issue 40134416](https://issues.chromium.org/issues/40134416)
  记录了硬件解码导致视频停止、音频继续的情况。报告指出 macOS 硬件解码器可能持续丢帧，直到收到可用的
  关键帧。
- 2026-07-28 检查的 Chromium `main` 源码在 VideoToolbox 返回空图像时直接结束回调，并留下了
  [通知输出队列丢帧的待办](https://source.chromium.org/chromium/chromium/src/+/main:media/gpu/mac/video_toolbox_video_decoder.cc;l=397)。
  [输出队列](https://source.chromium.org/chromium/chromium/src/+/main:media/gpu/mac/video_toolbox_output_queue.cc;l=68)
  会等待队首画面完成；队首缺少完成记录时，后续画面无法继续输出。这条路径可以解释画面停止和网页控制台
  没有错误。公开的完整复现主要使用 HEVC，H.264 仍需结合下一次冻结数据确认。
- Apple 官方文档说明
  [VideoToolbox](https://developer.apple.com/documentation/videotoolbox)
  会直接使用硬件编码器和解码器。
- Microsoft 的
  [Edge 图形加速策略](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/hardwareaccelerationmodeenabled)
  支持 macOS，修改后需要完整重启浏览器。

## 浏览器诊断信息

打开会话面板，进入 **设置 → 调试信息 → 远控调试日志**，记录冻结前后的条目。

使用 Edge 或 Chrome 时：

1. 在建立远控连接前打开 `edge://webrtc-internals` 或 `chrome://webrtc-internals`。
2. 复现画面冻结，再导出 WebRTC dump。
3. 保存 `edge://gpu` 或 `chrome://gpu` 的完整报告。
4. 打开 `edge://media-internals` 或 `chrome://media-internals`，保存能够找到的对应播放器信息。
5. 记录回车输入、首次停滞、恢复或重连的时间。

关闭图形加速后，即使没有复现，也应导出一份正常会话的诊断文件。重点比较：

- `decoderImplementation` 是否从 `VideoToolboxVideoDecoder` 切换到 FFmpeg 或其他软件解码器。
- `powerEfficientDecoder`、`packetsReceived`、`framesReceived`、`framesDecoded` 和 `framesDropped`。
- `pliCount`、`nackCount`、`firCount` 和 `keyFramesDecoded`。

统计数据可以按以下方式判断：

- `packetsReceived` 和 `framesReceived` 继续增长，`framesDecoded` 停止：优先检查解码器和输出队列。
- `framesDecoded` 继续增长，视频呈现帧停止：优先检查浏览器呈现和 GPU 合成。
- 回车后 `pliCount` 快速增长，`keyFramesDecoded` 没有增长：检查设备端是否发送了可用的 IDR，以及 SPS/PPS
  和分包是否完整。

如果关闭图形加速后仍显示 `VideoToolboxVideoDecoder`，继续比较 `edge://gpu` 和视频呈现帧。稳定性变化可能
来自 GPU 进程、画面合成或解码器配置变化。

Chromium 的 WebRTC 硬件解码适配器使用
[`NullMediaLog`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/platform/peerconnection/rtc_video_decoder_adapter.cc;l=282)。
`media-internals` 和网页控制台可能没有对应错误，排查时以 WebRTC 统计时间序列为准。

公开资料没有记录键盘事件直接触发 VideoToolbox 故障。回车可能带来较大的画面变化或关键帧，因此需要把输入
时间和视频统计放在同一条时间线上检查。

## macOS 被控端日志

UU 远程的安装版本不同，被控 Mac 上的日志可能位于以下一个或多个位置：

- `/Users/Shared/UURemote/<uid>/com.netease.uuremote.server/Logs/Server/UURemoteServer.log`
- `/Users/Shared/UURemote/<uid>/com.netease.uuremote.server/Logs/Streamer/streamer_log.txt`
- `/Users/Shared/UURemote/<uid>/com.netease.uuremote.server/Logs/Streamer/connection_log.txt`
- `~/Library/Application Support/com.netease.uuremote/Logs/`

## 网关日志

Node 网关会将日志写入 `/tmp/uurc-web-backend.log`。使用 Docker Compose 时也可以执行：

```bash
docker compose logs uurc-web
```

Cloudflare Workers Logs 只记录信令相关信息。信令完成后，音视频和输入由浏览器通过 WebRTC 传输，因此网关日志不包含浏览器解码和画面呈现状态。

## 分享诊断文件前

请从日志和 WebRTC dump 中移除 Token、设备 ID、IP 地址、账号信息、房间信息和会话信息。
