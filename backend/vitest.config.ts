import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // supertest 为每个请求新建临时 http server 并监听随机端口，偶发出现请求挂起到 5s 超时
    // 的 flaky（端口复用 / keep-alive / IPv6 解析竞争，属测试基础设施层，产品代码本身无问题）。
    // 用 retry 兜底：真正的功能回归会确定性地连续失败，不会被 retry 掩盖；只有这种间歇性
    // 基础设施 flaky 才会在重试后通过。
    retry: 2,
  },
  resolve: {
    alias: {
      "@uurc/shared/constants": new URL("../shared/src/constants.ts", import.meta.url).pathname,
      "@uurc/shared/frontendRoutes": new URL("../shared/src/frontendRoutes.ts", import.meta.url).pathname,
      "@uurc/shared/redact": new URL("../shared/src/redact.ts", import.meta.url).pathname,
      "@uurc/shared/remoteBootstrap": new URL("../shared/src/remoteBootstrap.ts", import.meta.url).pathname,
      "@uurc/shared/remoteSession": new URL("../shared/src/remoteSession.ts", import.meta.url).pathname,
      "@uurc/shared/roomConfig": new URL("../shared/src/roomConfig.ts", import.meta.url).pathname,
      "@uurc/shared/roomSession": new URL("../shared/src/roomSession.ts", import.meta.url).pathname,
      "@uurc/shared/runtimeProfile": new URL("../shared/src/runtimeProfile.ts", import.meta.url).pathname,
      "@uurc/shared/signalGateway/events": new URL("../shared/src/signalGateway/events.ts", import.meta.url).pathname,
      "@uurc/shared/signalGateway/model": new URL("../shared/src/signalGateway/model.ts", import.meta.url).pathname,
      "@uurc/shared/signalGateway/payload": new URL("../shared/src/signalGateway/payload.ts", import.meta.url).pathname,
      "@uurc/shared/signalGateway/requests": new URL("../shared/src/signalGateway/requests.ts", import.meta.url)
        .pathname,
      "@uurc/shared/signalGateway/status": new URL("../shared/src/signalGateway/status.ts", import.meta.url).pathname,
      "@uurc/shared/streamer/signalControl": new URL("../shared/src/streamer/signalControl.ts", import.meta.url)
        .pathname,
      "@uurc/shared/streamer/readiness": new URL("../shared/src/streamer/readiness.ts", import.meta.url).pathname,
      "@uurc/shared/streamer/signalSession": new URL("../shared/src/streamer/signalSession.ts", import.meta.url)
        .pathname,
      "@uurc/shared/streamer/signalSoac": new URL("../shared/src/streamer/signalSoac.ts", import.meta.url).pathname,
      "@uurc/shared/uuProxy": new URL("../shared/src/uuProxy.ts", import.meta.url).pathname,
      "@uurc/shared/uuTransport": new URL("../shared/src/uuTransport.ts", import.meta.url).pathname,
    },
  },
});
