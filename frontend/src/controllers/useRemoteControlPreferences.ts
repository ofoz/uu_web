import { useEffect, useState } from "react";

import type { ConnectionRouteMode, RemoteStageViewMode, SdpTransportMode } from "../app/remoteControlTypes.js";

export function useRemoteControlPreferences(signalServerCount: number) {
  const [autoReconnectEnabled, setAutoReconnectEnabled] = useState(true);
  const [sdpTransportMode, setSdpTransportMode] = useState<SdpTransportMode>("gzip");
  const [connectionRouteMode, setConnectionRouteMode] = useState<ConnectionRouteMode>("auto");
  const [autoConnect, setAutoConnect] = useState<boolean>(readAutoConnectPreference);
  const [remoteStageViewMode, setRemoteStageViewMode] = useState<RemoteStageViewMode>("fit");
  const [signalServerIndex, setSignalServerIndex] = useState(0);
  const [browserWebRtcUnavailableReason] = useState(detectBrowserWebRtcUnavailableReason);

  useEffect(() => {
    if (signalServerCount > 0 && signalServerIndex >= signalServerCount) {
      setSignalServerIndex(0);
    }
  }, [signalServerCount, signalServerIndex]);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem("uurc.autoConnect", autoConnect ? "true" : "false");
    } catch {
      // Ignore persistence failures in private or sandboxed browser contexts.
    }
  }, [autoConnect]);

  return {
    autoReconnectEnabled,
    setAutoReconnectEnabled,
    sdpTransportMode,
    setSdpTransportMode,
    connectionRouteMode,
    setConnectionRouteMode,
    autoConnect,
    setAutoConnect,
    remoteStageViewMode,
    setRemoteStageViewMode,
    signalServerIndex,
    setSignalServerIndex,
    browserWebRtcUnavailableReason,
  };
}

function readAutoConnectPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem("uurc.autoConnect") !== "false";
  } catch {
    return true;
  }
}

function detectBrowserWebRtcUnavailableReason(): string {
  if (typeof RTCPeerConnection !== "function") {
    return "当前浏览器未启用 WebRTC，无法建立远控画面。请允许 WebRTC 后重试。";
  }

  try {
    const peer = new RTCPeerConnection({ iceServers: [] });
    peer.close();
    return "";
  } catch {
    return "当前浏览器无法创建 WebRTC 连接。请检查浏览器隐私设置或扩展拦截后重试。";
  }
}
