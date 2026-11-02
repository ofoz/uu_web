import { ChevronLeft, CircleStop, LoaderCircle, PanelRight } from "lucide-react";

import type { UuDevice } from "@uurc/shared/devices";

import type { BusyAction } from "../app/remoteControlTypes.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";
import { RemoteScreenPicker } from "./RemoteScreenPicker.js";
import { StatusPill } from "./StatusPill.js";
import type { RemoteVideoSourcePanelProps } from "./RemoteVideoSourcePanel.js";

export interface RemoteControlTopbarProps {
  browserRemoteState: BrowserRemoteSessionState;
  busy: BusyAction;
  canDisconnectRemote: boolean;
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
  onReturnToDevices,
  onStopSignalGateway,
  selectedDevice,
  selectedTargetLabel,
  signalGatewayDisplay,
  screenPicker,
  panelOpen,
  onTogglePanel,
}: RemoteControlTopbarProps & {
  screenPicker: RemoteVideoSourcePanelProps;
  panelOpen: boolean;
  onTogglePanel: () => void;
}) {
  const stage = browserRemoteState.stage;
  const negotiating = stage === "controlled" || stage === "offered";
  const pillState = stage === "connected" ? "ready" : negotiating ? "connecting" : "idle";
  const pillLabel = stage === "connected" ? "已连接" : negotiating ? "连接中" : signalGatewayDisplay;

  return (
    <header className="control-topbar">
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
    </header>
  );
}
