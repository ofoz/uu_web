import { MonitorX, TerminalSquare } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { RemoteCommandBar, type RemoteCommandBarProps } from "./RemoteCommandBar.js";
import { RemoteConnectionTabs } from "./RemoteConnectionTabs.js";
import type { RemoteClipboardPanelProps } from "./RemoteClipboardPanel.js";
import type { RemoteConnectionQualityPanelProps } from "./RemoteConnectionQualityPanel.js";
import type { RemoteControlDiagnosticsDrawerProps } from "./RemoteControlDiagnosticsDrawer.js";
import type { RemoteControlSettingsDrawerProps } from "./RemoteControlSettingsDrawer.js";
import { RemoteControlSidePanel } from "./RemoteControlSidePanel.js";
import { RemoteControlStage, type RemoteControlStageProps } from "./RemoteControlStage.js";
import { RemoteControlTopbar, type RemoteControlTopbarProps } from "./RemoteControlTopbar.js";
import { RemoteControlWarnings, type RemoteControlWarningsProps } from "./RemoteControlWarnings.js";
import { RemoteOccupiedDialog } from "./RemoteOccupiedDialog.js";
import { RemoteReconnectBanner, type RemoteReconnectBannerProps } from "./RemoteReconnectBanner.js";
import type { RemoteVideoSourcePanelProps } from "./RemoteVideoSourcePanel.js";
import { useFullscreenChromeAutoHide } from "./useFullscreenChromeAutoHide.js";

export interface RemoteControlPageProps {
  shell: {
    deviceNotFound: boolean;
    error: string;
    isFullscreen: boolean;
    onReturnToDevices: () => void;
    remoteStageFrameRef: RefObject<HTMLDivElement | null>;
    /** 页内切换：直接跳到另一台已连接的设备。 */
    onSwitchConnection: (deviceId: string) => void;
    onCloseConnection: (deviceId: string) => void;
  };
  topbar: RemoteControlTopbarProps;
  commandBar: RemoteCommandBarProps;
  reconnect: RemoteReconnectBannerProps;
  stage: RemoteControlStageProps;
  warnings: RemoteControlWarningsProps;
  insights: {
    quality: RemoteConnectionQualityPanelProps;
    clipboard: RemoteClipboardPanelProps;
    videoSources: RemoteVideoSourcePanelProps;
  };
  settings: RemoteControlSettingsDrawerProps;
  diagnostics: RemoteControlDiagnosticsDrawerProps;
}

export function RemoteControlPage(props: RemoteControlPageProps) {
  const { shell } = props;
  const [panelOpen, setPanelOpen] = useState(true);
  const [sidePanelTab, setSidePanelTab] = useState("status");
  const [occupiedDialogOpen, setOccupiedDialogOpen] = useState(false);
  const [occupancyAcknowledged, setOccupancyAcknowledged] = useState(false);
  const [takeoverPending, setTakeoverPending] = useState(false);

  // 顶栏、状态徽标、工具栏统一走自动隐藏。
  // 连接成功后画面就是主角：即使没进全屏也先隐身，鼠标触顶或靠近它们再唤出；
  // 未连接时保持常驻，否则用户找不到「开始连接」这类入口。
  const chromeAnchorRef = useRef<HTMLElement | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);
  const chromeAnchors = useMemo(() => [topbarRef, chromeAnchorRef], []);
  const immersive = shell.isFullscreen || props.stage.browserRemoteState.stage === "connected";
  const chrome = useFullscreenChromeAutoHide(immersive, chromeAnchors);

  const { occupiedBySelfClient, selectedDeviceOccupied } = props.warnings;
  // 若用户已在“设置”里显式选择了“接管控制”，无需再弹一次确认对话框。
  const showOccupiedGate =
    selectedDeviceOccupied && !occupiedBySelfClient && !occupancyAcknowledged && !props.settings.forceJoin;

  function handlePrimaryAction() {
    if (showOccupiedGate) {
      setOccupiedDialogOpen(true);
      return;
    }
    props.commandBar.onNextAction();
  }

  function resolveOccupiedDialog(force: boolean) {
    setOccupiedDialogOpen(false);
    setOccupancyAcknowledged(true);
    if (!force) {
      props.commandBar.onNextAction();
      return;
    }
    // setForceJoin 是异步的：直接接着调 onNextAction，拿到的还是旧闭包里的
    // forceJoin=false，等于又普通加入一次又被拒。改成置标记，等 forceJoin
    // 落到新一次渲染后再触发，这次才会真的走强制接管。
    props.settings.onForceJoinChange(true);
    setTakeoverPending(true);
  }

  useEffect(() => {
    if (!takeoverPending || !props.settings.forceJoin) return;
    setTakeoverPending(false);
    props.commandBar.onNextAction();
  }, [props.commandBar, props.settings.forceJoin, takeoverPending]);

  if (shell.deviceNotFound) {
    return (
      <main className="control-shell">
        <header className="control-topbar">
          <button className="secondary-button" onClick={shell.onReturnToDevices}>
            返回设备列表
          </button>
          <div>
            <h1>设备不存在</h1>
          </div>
          <div className="topbar-actions" />
        </header>
        <section className="device-missing-card">
          <MonitorX size={40} />
          <strong>找不到这台设备</strong>
          <p>该设备可能已被移除、不属于当前账号，或链接已失效。请返回设备列表重新选择。</p>
          <button className="primary-action-button" onClick={shell.onReturnToDevices}>
            返回设备列表
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="control-shell">
      {/*
        多连接时在顶栏上方给一条页签，点一下就换到另一台已连接的设备，
        不必先退回设备列表 —— 这是"多机来回切"的主要入口。
      */}
      <RemoteConnectionTabs
        activeDeviceId={props.topbar.selectedDevice?.deviceId}
        onClose={shell.onCloseConnection}
        onSwitch={shell.onSwitchConnection}
      />

      <RemoteControlTopbar
        {...props.topbar}
        screenPicker={props.insights.videoSources}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((open) => !open)}
        fullscreen={shell.isFullscreen}
        chromeHidden={chrome.hidden}
        chromeHoverBindings={chrome.hoverBindings}
        topbarRef={topbarRef}
        commandBar={
          <RemoteCommandBar
            {...props.commandBar}
            onNextAction={handlePrimaryAction}
            chromeHidden={chrome.hidden}
            chromeHoverBindings={chrome.hoverBindings}
            onChromeHoldingChange={chrome.setHolding}
            chromeAnchorRef={chromeAnchorRef}
            docked
          />
        }
      />

      {shell.error ? (
        <section className="error-strip" role="alert" aria-live="assertive">
          <TerminalSquare size={18} />
          <span>{shell.error}</span>
        </section>
      ) : null}

      <RemoteControlWarnings {...props.warnings} />

      <section className="control-stage-layout">
        <div
          className={`control-stage-frame${shell.isFullscreen ? " control-stage-frame--fullscreen" : ""}`}
          ref={shell.remoteStageFrameRef}
        >
          <RemoteControlStage {...props.stage} />
          <RemoteReconnectBanner {...props.reconnect} />
          {shell.isFullscreen ? (
            <div className={`fullscreen-hint${chrome.hidden ? " fullscreen-hint--idle-hidden" : ""}`}>
              鼠标移到屏幕顶部可唤出顶栏与工具栏
            </div>
          ) : null}
        </div>
        <AnimatePresence initial={false}>
          {panelOpen ? (
            <RemoteControlSidePanel
              key="remote-control-side-panel"
              tab={sidePanelTab}
              onTabChange={setSidePanelTab}
              insights={props.insights}
              settings={props.settings}
              diagnostics={props.diagnostics}
            />
          ) : null}
        </AnimatePresence>
      </section>

      <RemoteOccupiedDialog
        open={occupiedDialogOpen}
        deviceLabel={props.topbar.selectedDevice?.alias ?? props.topbar.selectedTargetLabel}
        participants={props.settings.selectedParticipants}
        onCancel={() => setOccupiedDialogOpen(false)}
        onJoinNormal={() => resolveOccupiedDialog(false)}
        onTakeover={() => resolveOccupiedDialog(true)}
      />
    </main>
  );
}
