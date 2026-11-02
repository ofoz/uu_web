import type {
  RemoteSignalControlRequest,
  RemoteSignalControlResult,
  RemoteSignalGatewayEvent,
  RemoteSignalGatewayStartRequest,
  RemoteSignalGatewayStatus,
  RemoteSignalSoacRequest,
  RemoteSignalSoacResult,
} from "@uurc/shared/signalGateway/model";
import type { RemoteSignalReadinessDiagnostics } from "@uurc/shared/streamer/readiness";

import { getRemoteSignalStartContext } from "../uu/roomApi.js";
import { requestJson } from "./httpClient.js";

export function startRemoteSignalGateway(
  input: RemoteSignalGatewayStartRequest = {},
): Promise<RemoteSignalGatewayStatus> {
  return requestJson<RemoteSignalGatewayStatus>(
    "/api/remote/signal/start",
    {
      method: "POST",
      body: JSON.stringify({ ...input, ...getRemoteSignalStartContext() }),
    },
    true,
  );
}

export function stopRemoteSignalGateway(): Promise<RemoteSignalGatewayStatus> {
  return requestJson<RemoteSignalGatewayStatus>("/api/remote/signal", { method: "DELETE" }, true);
}

export function getRemoteSignalEvents(afterEventId?: number): Promise<RemoteSignalGatewayEvent[]> {
  const query = afterEventId && afterEventId > 0 ? `?after=${afterEventId}` : "";
  return requestJson<RemoteSignalGatewayEvent[]>(`/api/remote/signal/events${query}`, {}, true);
}

export function getRemoteSignalDiagnostics(): Promise<RemoteSignalReadinessDiagnostics> {
  return requestJson<RemoteSignalReadinessDiagnostics>("/api/remote/signal/diagnostics", {}, true);
}

export function sendRemoteSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult> {
  return requestJson<RemoteSignalControlResult>(
    "/api/remote/signal/control",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
}

export function sendRemoteSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult> {
  return requestJson<RemoteSignalSoacResult>(
    "/api/remote/signal/soac",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
}
