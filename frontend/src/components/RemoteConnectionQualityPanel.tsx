import { RotateCcw } from "lucide-react";

import type { RemoteConnectionQuality } from "../app/remoteControlTypes.js";
import { AnimatedDisclosure } from "./ui/AnimatedDisclosure.js";
import { Switch } from "./ui/Switch.js";

export interface RemoteConnectionQualityPanelProps {
  autoReconnectEnabled: boolean;
  autoReconnectLabel: string;
  connectionQuality: RemoteConnectionQuality;
  onAutoReconnectEnabledChange: (enabled: boolean) => void;
}

// 普通用户一眼能看懂的核心指标常驻显示；其余专业/诊断指标收进“更多指标”，减少信息过载。
const PRIMARY_METRIC_LABELS = new Set(["路径", "画面", "输入", "延迟", "帧率", "分辨率"]);

export function RemoteConnectionQualityPanel({
  autoReconnectEnabled,
  autoReconnectLabel,
  connectionQuality,
  onAutoReconnectEnabledChange,
}: RemoteConnectionQualityPanelProps) {
  const primaryMetrics = connectionQuality.metrics.filter((metric) => PRIMARY_METRIC_LABELS.has(metric.label));
  const advancedMetrics = connectionQuality.metrics.filter((metric) => !PRIMARY_METRIC_LABELS.has(metric.label));

  return (
    <section className={`metric-panel quality-${connectionQuality.state}`} aria-label="连接质量">
      {connectionQuality.detail ? <p className="metric-panel-detail">{connectionQuality.detail}</p> : null}
      <div className="metric-rows" aria-label="连接质量指标">
        {primaryMetrics.map((metric) => (
          <div className="metric-row" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      {advancedMetrics.length > 0 ? (
        <AnimatedDisclosure className="quality-more" contentClassName="quality-more-content" summary="更多指标">
          <div className="metric-rows" aria-label="更多连接质量指标">
            {advancedMetrics.map((metric) => (
              <div className="metric-row" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </AnimatedDisclosure>
      ) : null}
      <Switch
        inline
        checked={autoReconnectEnabled}
        onChange={onAutoReconnectEnabledChange}
        label={
          <>
            <RotateCcw size={15} />
            自动重连
          </>
        }
      />
      <small className="metric-panel-hint">{autoReconnectLabel}</small>
    </section>
  );
}
