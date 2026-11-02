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
  const hasSources = remoteVideoSources.length > 0;

  return (
    <section className="video-source-panel" aria-label="画面源">
      <div className="video-source-caption">{hasSources ? `画面源 · ${remoteVideoSources.length} 路` : "画面源"}</div>
      <div className="video-source-list">
        {hasSources ? (
          remoteVideoSources.map((source) => (
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
