import type { RemoteSignalGatewayEvent } from "@uurc/shared/signalGateway/model";

export function summarizeSignalEventForLog(record: RemoteSignalGatewayEvent): string {
  const segments: string[] = [`#${record.id}`, record.direction, record.event];
  const items = Array.isArray(record.payload) ? record.payload : [record.payload];
  for (const item of items) {
    const summary = describeSignalLogItem(item);
    if (summary) segments.push(summary);
  }
  return segments.join(" ");
}

function describeSignalLogItem(item: unknown): string | null {
  if (typeof item === "string") return `ack=${item}`;
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const record = item as Record<string, unknown>;
  const parts: string[] = [];
  pushLogField(parts, "appControlId", record.app_control_id);
  pushLogField(parts, "clientId", record.client_id);

  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const inner = data as Record<string, unknown>;
    pushLogField(parts, "type", inner.type);
    pushLogField(parts, "iceId", inner.ice_id);
    pushLogField(parts, "reason", inner.reason);
    if (typeof inner.sdp === "string") parts.push(`sdpLen=${inner.sdp.length}`);
    const candidate = inner.candidate;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const candidateText = (candidate as Record<string, unknown>).candidate;
      if (typeof candidateText === "string") {
        const typeMatch = /typ\s+(\S+)/.exec(candidateText);
        if (typeMatch) parts.push(`cand=${typeMatch[1]}`);
      }
    }
  } else {
    pushLogField(parts, "type", record.type);
    pushLogField(parts, "iceId", record.ice_id);
    pushLogField(parts, "reason", record.reason);
  }
  return parts.length ? parts.join(" ") : null;
}

function pushLogField(parts: string[], label: string, value: unknown): void {
  if (typeof value === "string" && value.length > 0) parts.push(`${label}=${value}`);
}
