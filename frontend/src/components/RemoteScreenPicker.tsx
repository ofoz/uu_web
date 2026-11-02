import { useEffect, useRef } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";

import type { RemoteVideoSourcePanelProps } from "./RemoteVideoSourcePanel.js";

export function RemoteScreenPicker({
  onRemoteVideoSourceChange,
  primaryRemoteVideoId,
  remoteVideoSources,
}: RemoteVideoSourcePanelProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const active = remoteVideoSources.find((source) => source.id === primaryRemoteVideoId);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const onPointerDown = (event: Event) => {
      if (details.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.open) details.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (remoteVideoSources.length <= 1) return null;

  return (
    <details className="screen-picker" ref={detailsRef}>
      <summary>
        <LayoutGrid size={14} />
        画面 {active ? active.index + 1 : "-"}
        <ChevronDown className="screen-picker-chevron" size={12} />
      </summary>
      <div className="screen-picker-panel" role="menu" aria-label="选择画面源">
        {remoteVideoSources.map((source) => (
          <button
            type="button"
            key={source.id}
            className={source.id === primaryRemoteVideoId ? "is-active" : ""}
            onClick={() => {
              onRemoteVideoSourceChange(source.id);
              if (detailsRef.current) detailsRef.current.open = false;
            }}
          >
            <span>画面 {source.index + 1}</span>
            <small>{source.hasSignal ? source.resolution || "画面中" : "无信号"}</small>
          </button>
        ))}
      </div>
    </details>
  );
}
