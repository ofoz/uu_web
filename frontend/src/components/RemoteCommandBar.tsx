import { Eye, GripHorizontal, LoaderCircle, Maximize2, MousePointerClick, PlugZap, Scan } from "lucide-react";
import { useEffect, type RefObject } from "react";

import type { BusyAction, NextAction, RemoteStageViewMode } from "../app/remoteControlTypes.js";
import type { RemoteShortcut } from "../remote/remoteShortcuts.js";
import { RemoteAudioControl, type RemoteAudioControlProps } from "./RemoteAudioControl.js";
import { RemoteShortcutMenu } from "./RemoteShortcutMenu.js";
import { useDraggableFloatingPanel } from "./useDraggableFloatingPanel.js";
import type { FullscreenChromeHoverBindings } from "./useFullscreenChromeAutoHide.js";

export interface RemoteCommandBarProps {
  busy: BusyAction;
  controlChannelState: RTCDataChannelState;
  inputControlActive: boolean;
  isFullscreen: boolean;
  nextAction: NextAction;
  onNextAction: () => void;
  onRemoteShortcut: (shortcut: RemoteShortcut) => void;
  onStageViewModeChange: (mode: RemoteStageViewMode) => void;
  onToggleInputControl: () => void;
  onToggleFullscreen: () => void;
  remoteAudio: RemoteAudioControlProps;
  remoteShortcutPlatform: string;
  remoteStageViewMode: RemoteStageViewMode;
}

export interface RemoteCommandBarChromeProps {
  /** 全屏空闲时由页面统一控制隐藏，保证工具栏与状态徽标同步淡出。 */
  chromeHidden: boolean;
  chromeHoverBindings: FullscreenChromeHoverBindings;
  onChromeHoldingChange: (holding: boolean) => void;
  /** 供页面判断"鼠标是否回到工具栏附近"，用于全屏唤出。 */
  chromeAnchorRef: RefObject<HTMLElement | null>;
}

export function RemoteCommandBar({
  busy,
  controlChannelState,
  inputControlActive,
  isFullscreen,
  nextAction,
  onNextAction,
  onRemoteShortcut,
  onStageViewModeChange,
  onToggleInputControl,
  onToggleFullscreen,
  remoteAudio,
  remoteShortcutPlatform,
  remoteStageViewMode,
  chromeHidden,
  chromeHoverBindings,
  onChromeHoldingChange,
  chromeAnchorRef,
}: RemoteCommandBarProps & RemoteCommandBarChromeProps) {
  const nextStageMode = remoteStageViewMode === "fit" ? "fill" : "fit";
  const { dragHandleProps, isDragging, panelRef, panelStyle } = useDraggableFloatingPanel<HTMLElement>();
  const connected = controlChannelState === "open";
  const idleHidden = chromeHidden;

  // 拖动期间钉住悬浮层，避免拖到一半因为空闲计时淡出。
  useEffect(() => {
    onChromeHoldingChange(isDragging);
  }, [isDragging, onChromeHoldingChange]);

  return (
    <section
      ref={(node) => {
        panelRef.current = node;
        chromeAnchorRef.current = node;
      }}
      className={`control-command-bar${idleHidden ? " control-command-bar--idle-hidden" : ""}`}
      style={panelStyle}
      aria-label="远控主流程"
      aria-hidden={idleHidden}
      {...chromeHoverBindings}
    >
      <button className="command-drag-handle" type="button" aria-label="拖动工具栏" {...dragHandleProps}>
        <GripHorizontal size={17} />
      </button>
      <div className="command-action-group command-action-primary">
        {connected ? (
          <div className="control-mode-switch" role="group" aria-label="控制模式">
            <button
              type="button"
              className={!inputControlActive ? "is-active" : ""}
              aria-pressed={!inputControlActive}
              onClick={() => {
                if (inputControlActive) onToggleInputControl();
              }}
            >
              <Eye size={16} />
              仅查看
            </button>
            <button
              type="button"
              className={inputControlActive ? "is-active" : ""}
              aria-pressed={inputControlActive}
              onClick={() => {
                if (!inputControlActive) onToggleInputControl();
              }}
            >
              <MousePointerClick size={16} />
              控制中
            </button>
          </div>
        ) : (
          <button className="primary-action-button" onClick={onNextAction} disabled={nextAction.disabled}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <PlugZap size={17} />}
            {nextAction.label}
          </button>
        )}
      </div>
      {!connected && nextAction.detail ? <p className="operation-note">{nextAction.detail}</p> : null}
      <div className="command-action-group command-action-tools" aria-label="远控工具栏">
        <RemoteAudioControl {...remoteAudio} />
        <button onClick={() => onStageViewModeChange(nextStageMode)}>
          <Scan size={17} />
          {remoteStageViewMode === "fit" ? "填充画面" : "适应画面"}
        </button>
        <button onClick={onToggleFullscreen}>
          <Maximize2 size={17} />
          {isFullscreen ? "退出全屏" : "全屏"}
        </button>
        <RemoteShortcutMenu
          disabled={!inputControlActive}
          platformKey={remoteShortcutPlatform}
          onRemoteShortcut={onRemoteShortcut}
        />
      </div>
    </section>
  );
}
