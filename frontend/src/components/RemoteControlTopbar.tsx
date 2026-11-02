import { ChevronLeft, CircleStop, LoaderCircle, PanelRight } from "lucide-react";
import type { RefObject } from "react";

import type { UuDevice } from "@uurc/shared/devices";

import type { BusyAction, RemoteConnectionQuality } from "../app/remoteControlTypes.js";
import { DesktopWindowControls } from "../desktop/DesktopWindowControls.js";
import { useDesktopBridge } from "../desktop/useDesktopBridge.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";
import { RemoteControlConnectionStats } from "./RemoteControlConnectionStats.js";
import { RemoteScreenPicker } from "./RemoteScreenPicker.js";
import { StatusPill } from "./StatusPill.js";
import type { RemoteVideoSourcePanelProps } from "./RemoteVideoSourcePanel.js";
import type { FullscreenChromeHoverBindings } from "./useFullscreenChromeAutoHide.js";

export interface RemoteControlTopbarProps {
  browserRemoteState: BrowserRemoteSessionState;
  busy: BusyAction;
  canDisconnectRemote: boolean;
  connectionQuality: RemoteConnectionQuality;
  onReturnToDevices: () => void;
  onStopSignalGateway: () => void;
  selectedDevice: UuDevice | null;
  selectedTargetLabel: string;
  signalGatewayDisplay: string;
}

export function RemoteControlTopbar({
  browserRemoteState,
  busy,
  canDisconnectRemote,
  connectionQuality,
  onReturnToDevices,
  onStopSignalGateway,
  selectedDevice,
  selectedTargetLabel,
  signalGatewayDisplay,
  screenPicker,
  panelOpen,
  onTogglePanel,
  fullscreen = false,
  chromeHidden = false,
  chromeHoverBindings,
  topbarRef,
}: RemoteControlTopbarProps & {
  screenPicker: RemoteVideoSourcePanelProps;
  panelOpen: boolean;
  onTogglePanel: () => void;
  fullscreen?: boolean;
  // 全屏时顶栏跟随状态徽标一起自动隐藏，鼠标触顶或移上来才显示。
  chromeHidden?: boolean;
  chromeHoverBindings?: FullscreenChromeHoverBindings;
  topbarRef?: RefObject<HTMLElement | null>;
}) {
  const desktopBridge = useDesktopBridge();
  const stage = browserRemoteState.stage;
  const negotiating = stage === "controlled" || stage === "offered";
  const pillState = stage === "connected" ? "ready" : negotiating ? "connecting" : "idle";
  const pillLabel = stage === "connected" ? "已连接" : negotiating ? "连接中" : signalGatewayDisplay;
  const className = [
    "control-topbar",
    fullscreen ? "control-topbar--overlay" : "",
    chromeHidden ? "control-topbar--chrome-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={className} ref={topbarRef} {...chromeHoverBindings}>
      <button
        className="icon-button icon-button-dark"
        onClick={onReturnToDevices}
        disabled={busy !== null}
        title="返回设备列表"
        aria-label="返回设备列表"
      >
        <ChevronLeft size={16} />
      </button>
      <h1 className="control-topbar-title">{selectedDevice?.alias ?? selectedTargetLabel}</h1>
      <StatusPill dark state={pillState}>
        {pillLabel}
      </StatusPill>
      {stage === "connected" ? (
        <RemoteControlConnectionStats
          connectedAtMs={browserRemoteState.connectedAtMs}
          connectionQuality={connectionQuality}
        />
      ) : null}
      <span className="control-topbar-spacer" />
      <RemoteScreenPicker {...screenPicker} />
      <button
        type="button"
        className={`icon-button icon-button-dark${panelOpen ? " is-active" : ""}`}
        onClick={onTogglePanel}
        title="会话面板"
        aria-label="切换会话面板"
        aria-pressed={panelOpen}
      >
        <PanelRight size={14} />
      </button>
      {negotiating ? (
        <button
          className="secondary-button control-topbar-cancel"
          onClick={onStopSignalGateway}
          disabled={busy !== null}
        >
          取消
        </button>
      ) : canDisconnectRemote ? (
        <button
          className="control-topbar-disconnect"
          onClick={onStopSignalGateway}
          disabled={busy !== null}
          title="断开连接，释放设备占用"
        >
          {busy === "signal-stop" ? <LoaderCircle className="spin" size={14} /> : <CircleStop size={14} />}
          断开
        </button>
      ) : null}
      {desktopBridge ? <DesktopWindowControls bridge={desktopBridge} /> : null}
    </header>
  );
}
