import { useState } from "react";

import type { RemoteVideoSourceInfo } from "../app/remoteControlTypes.js";

export interface RemoteVideoSourcePanelProps {
  onRemoteVideoSourceChange: (videoId: string) => void;
  primaryRemoteVideoId: string;
  remoteVideoSources: RemoteVideoSourceInfo[];
}

export function RemoteVideoSourcePanel({
  onRemoteVideoSourceChange,
  primaryRemoteVideoId,
  remoteVideoSources,
}: RemoteVideoSourcePanelProps) {
  const [showSilent, setShowSilent] = useState(false);
  const liveSources = remoteVideoSources.filter((source) => !source.silent);
  const silentCount = remoteVideoSources.length - liveSources.length;
  // 一路画面都没有时不折叠，否则这里会空成「暂无画面源」，反而看不出远端到底推了几路。
  const visibleSources = liveSources.length > 0 && !showSilent ? liveSources : remoteVideoSources;
  const hasSources = visibleSources.length > 0;

  return (
    <section className="video-source-panel" aria-label="画面源">
      <div className="video-source-caption">
        <span>{hasSources ? `画面源 · ${visibleSources.length} 路` : "画面源"}</span>
        {silentCount > 0 && liveSources.length > 0 ? (
          <button
            type="button"
            className="video-source-silent-toggle"
            aria-expanded={showSilent}
            onClick={() => setShowSilent((current) => !current)}
          >
            {showSilent ? "收起无画面" : `+${silentCount} 路无画面`}
          </button>
        ) : null}
      </div>
      <div className="video-source-list">
        {hasSources ? (
          visibleSources.map((source) => (
            <button
              type="button"
              key={source.id}
              className={source.hasSignal ? undefined : "video-source-empty"}
              aria-pressed={source.id === primaryRemoteVideoId}
              onClick={() => onRemoteVideoSourceChange(source.id)}
            >
              <span>画面 {source.index + 1}</span>
              <small>{source.hasSignal ? source.resolution || "画面中" : "无信号"}</small>
            </button>
          ))
        ) : (
          <span>暂无画面源</span>
        )}
      </div>
    </section>
  );
}
