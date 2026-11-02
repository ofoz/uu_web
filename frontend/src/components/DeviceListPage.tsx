import { ChevronRight, LoaderCircle, RefreshCw, TerminalSquare } from "lucide-react";

import type { AuthStatus } from "@uurc/shared/authState";
import type { UuDeviceGroups } from "@uurc/shared/devices";

import { preloadRemoteControlRoute } from "../routeLoaders.js";
import { DeviceList } from "./DeviceControls.js";

export function DeviceListPage({
  authStatus,
  devices,
  devicesLoaded,
  assistanceConnectId,
  error,
  busy,
  onLoadDevices,
  onSelectDevice,
  onOpenDevice,
  onAssistanceConnectIdChange,
  onStartRemoteAssistance,
}: {
  authStatus: AuthStatus | null;
  devices: UuDeviceGroups;
  devicesLoaded: boolean;
  assistanceConnectId: string;
  error: string;
  busy: string | null;
  onLoadDevices: () => void;
  onSelectDevice: (deviceId: string) => void;
  onOpenDevice: (deviceId: string) => void;
  onAssistanceConnectIdChange: (value: string) => void;
  onStartRemoteAssistance: () => void;
}) {
  const hasDevices = devices.desktopDevices.length + devices.mobileDevices.length + devices.tvDevices.length > 0;
  const devicesLoading = !error && (busy === "devices" || !devicesLoaded);
  const showDeviceList = !error || devicesLoaded || hasDevices;
  const canQuickConnect = busy === null && assistanceConnectId.trim().length > 0;

  return (
    <>
      <header className="shell-page-topbar">
        <h1>我的设备</h1>
        <form
          className="device-quick-connect"
          onFocusCapture={preloadRemoteControlRoute}
          onMouseEnter={preloadRemoteControlRoute}
          onPointerDown={preloadRemoteControlRoute}
          onSubmit={(event) => {
            event.preventDefault();
            if (canQuickConnect) onStartRemoteAssistance();
          }}
        >
          <input
            value={assistanceConnectId}
            onChange={(event) => onAssistanceConnectIdChange(event.target.value.replace(/\D/g, ""))}
            placeholder="输入设备 ID 直连…"
            inputMode="numeric"
            maxLength={12}
            aria-label="按设备 ID 直连"
          />
          <button type="submit" disabled={!canQuickConnect}>
            {busy === "assistance" ? <LoaderCircle className="spin" size={13} /> : "连接"}
            <ChevronRight size={13} />
          </button>
        </form>
        <button
          type="button"
          className="icon-button"
          onClick={onLoadDevices}
          disabled={busy !== null}
          title="刷新设备"
          aria-label="刷新设备列表"
        >
          {busy === "devices" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
        </button>
      </header>

      <div className="shell-page-body">
        <div className="shell-page-body-wide">
          {error ? (
            <section className="error-strip" role="alert" aria-live="assertive">
              <TerminalSquare size={18} />
              <span>{error}</span>
            </section>
          ) : null}

          {showDeviceList ? (
            <DeviceList
              devices={devices}
              loading={devicesLoading}
              currentDeviceId={authStatus?.deviceId}
              onSelect={onSelectDevice}
              onConnect={onOpenDevice}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
