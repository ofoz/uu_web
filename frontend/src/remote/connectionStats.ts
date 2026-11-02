import type { RemoteConnectionQuality } from "../app/remoteControlTypes.js";

// 顶栏位置窄，采样未出结果时用占位符，具体原因留给侧栏「连接质量」面板解释。
const PENDING_METRIC_VALUES = new Set(["采样中", "暂无", "-", ""]);

/**
 * 连接时长格式化：不足 1 小时显示 mm:ss，超过 1 小时显示 h:mm:ss。
 * 负数或非法值按 0 处理，避免时钟回拨时出现 `-1:-5`。
 */
export function formatConnectionDuration(elapsedMs: number): string {
  const totalSeconds = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0;
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** 从连接质量指标里取某一项的展示值；未采样时返回空字符串，由调用方决定占位符。 */
export function readConnectionMetric(connectionQuality: RemoteConnectionQuality, label: string): string {
  const metric = connectionQuality.metrics.find((item) => item.label === label);
  if (!metric || PENDING_METRIC_VALUES.has(metric.value.trim())) return "";
  return metric.value;
}
