import { Activity, MonitorPlay, Timer } from "lucide-react";
import { useEffect, useState } from "react";

import type { RemoteConnectionQuality } from "../app/remoteControlTypes.js";
import { formatConnectionDuration, readConnectionMetric } from "../remote/connectionStats.js";

export interface RemoteControlConnectionStatsProps {
  connectedAtMs?: number;
  connectionQuality: RemoteConnectionQuality;
}

/**
 * 顶栏「已连接」后面的实时指标：连接时长 / 延迟 / 帧率。
 * 数据全部复用侧栏「连接质量」的采样结果，这里只做紧凑展示，不额外开采样通道。
 */
export function RemoteControlConnectionStats({ connectedAtMs, connectionQuality }: RemoteControlConnectionStatsProps) {
  const elapsedMs = useElapsedMs(connectedAtMs);
  const latency = readConnectionMetric(connectionQuality, "延迟");
  const fps = readConnectionMetric(connectionQuality, "帧率");
  const duration = elapsedMs === null ? "--:--" : formatConnectionDuration(elapsedMs);
  const degraded = connectionQuality.state === "warn" || connectionQuality.state === "bad";

  return (
    <span
      className={`control-stats quality-${connectionQuality.state}`}
      title={`连接质量：${connectionQuality.title}${connectionQuality.detail ? `（${connectionQuality.detail}）` : ""}`}
      aria-label={`连接时长 ${duration}，延迟 ${latency || "采样中"}，帧率 ${fps || "采样中"}，质量${connectionQuality.title}`}
    >
      <span className="control-stat">
        <Timer size={12} aria-hidden />
        <span className="control-stat-value">{duration}</span>
      </span>
      <span className="control-stat control-stat-metric" title={`延迟 ${latency || "采样中"}`}>
        <Activity size={12} aria-hidden />
        <span className="control-stat-value">{latency || "—"}</span>
      </span>
      <span className="control-stat control-stat-metric" title={`帧率 ${fps || "采样中"}`}>
        <MonitorPlay size={12} aria-hidden />
        <span className="control-stat-value">{fps || "—"}</span>
      </span>
      {degraded ? <span className="control-stat control-stat-alert">{connectionQuality.title}</span> : null}
    </span>
  );
}

// 时长每秒刷新一次；连接时间未就绪时不挂计时器，避免空转。
function useElapsedMs(connectedAtMs: number | undefined): number | null {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (connectedAtMs === undefined) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [connectedAtMs]);

  return connectedAtMs === undefined ? null : Math.max(0, nowMs - connectedAtMs);
}
