import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { SIGNAL_GATEWAY_MAX_EVENTS } from "@uurc/shared/signalGateway/status";
import type { RemoteSignalGatewayEvent, RemoteSignalGatewayStatus } from "@uurc/shared/signalGateway/model";
import type { RemoteSignalReadinessDiagnostics } from "@uurc/shared/streamer/readiness";

import type { RoomJoinContext } from "../app/remoteControlTypes.js";
import { getRemoteSignalDiagnostics, getRemoteSignalEvents } from "../api/remoteSignalApi.js";
import type { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";

export function useSignalGatewayController({
  browserStage,
  browserSessionRef,
  onPollingError,
  onSessionStateChange,
}: {
  browserStage: BrowserRemoteSessionState["stage"];
  browserSessionRef: RefObject<BrowserRemoteSession | null>;
  onPollingError(message: string): void;
  onSessionStateChange(state: BrowserRemoteSessionState): void;
}) {
  const [signalGatewayContext, setSignalGatewayContext] = useState<RoomJoinContext | null>(null);
  const [signalGatewayStatus, setSignalGatewayStatus] = useState<RemoteSignalGatewayStatus | null>(null);
  const [signalEvents, setSignalEvents] = useState<RemoteSignalGatewayEvent[]>([]);
  const [remoteSignalDiagnostics, setRemoteSignalDiagnostics] = useState<RemoteSignalReadinessDiagnostics | null>(null);
  const lastSignalEventIdRef = useRef(0);

  const resetSignalEvents = useCallback(() => {
    lastSignalEventIdRef.current = 0;
    setSignalEvents([]);
    setRemoteSignalDiagnostics(null);
  }, []);

  const resetSignalGateway = useCallback(() => {
    resetSignalEvents();
    setSignalGatewayContext(null);
    setSignalGatewayStatus(null);
  }, [resetSignalEvents]);

  const refreshSignalEvents = useCallback(
    async (session = browserSessionRef.current) => {
      const [nextEvents, diagnostics] = await Promise.all([
        getRemoteSignalEvents(lastSignalEventIdRef.current),
        getRemoteSignalDiagnostics(),
      ]);

      if (nextEvents.length > 0) {
        lastSignalEventIdRef.current = Math.max(lastSignalEventIdRef.current, ...nextEvents.map((event) => event.id));
        setSignalEvents((current) => mergeSignalEvents(current, nextEvents));
        await session?.applySignalEvents(nextEvents);
      }
      if (session) {
        await session.refreshConnectionStats();
        onSessionStateChange(session.getState());
      }
      setRemoteSignalDiagnostics(diagnostics);
      setSignalGatewayStatus((current) => synchronizeGatewayStatus(current, diagnostics));
    },
    [browserSessionRef, onSessionStateChange],
  );

  useEffect(() => {
    const gatewayActive = signalGatewayStatus?.status === "connected" || signalGatewayStatus?.status === "connecting";
    if (!gatewayActive || browserStage === "idle") return;

    let stopped = false;
    let syncing = false;
    const sync = async () => {
      if (stopped || syncing || !browserSessionRef.current) return;
      syncing = true;
      try {
        await refreshSignalEvents();
      } catch (caught) {
        if (!stopped) onPollingError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        syncing = false;
      }
    };

    void sync();
    const intervalMs = browserStage === "connected" ? 1500 : 600;
    const timer = window.setInterval(sync, intervalMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [browserSessionRef, browserStage, onPollingError, refreshSignalEvents, signalGatewayStatus?.status]);

  return {
    signalGatewayContext,
    setSignalGatewayContext,
    signalGatewayStatus,
    setSignalGatewayStatus,
    signalEvents,
    remoteSignalDiagnostics,
    setRemoteSignalDiagnostics,
    resetSignalEvents,
    resetSignalGateway,
    refreshSignalEvents,
  };
}

function mergeSignalEvents(
  current: RemoteSignalGatewayEvent[],
  incoming: RemoteSignalGatewayEvent[],
): RemoteSignalGatewayEvent[] {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()].sort((left, right) => left.id - right.id).slice(-SIGNAL_GATEWAY_MAX_EVENTS);
}

function synchronizeGatewayStatus(
  current: RemoteSignalGatewayStatus | null,
  diagnostics: RemoteSignalReadinessDiagnostics,
): RemoteSignalGatewayStatus | null {
  if (!current) return current;
  if (
    current.status === diagnostics.gatewayStatus &&
    current.error === diagnostics.gatewayError &&
    current.updatedAt === diagnostics.updatedAt
  ) {
    return current;
  }
  return {
    ...current,
    status: diagnostics.gatewayStatus,
    connectionId: diagnostics.gatewayStatus === "connected" ? current.connectionId : undefined,
    updatedAt: diagnostics.updatedAt ?? current.updatedAt,
    error: diagnostics.gatewayError,
  };
}
