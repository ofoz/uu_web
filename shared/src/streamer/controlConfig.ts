import { buildStreamerBrowserDeviceCapability } from "./internal/controlConfigSchema.js";
import { asRecord } from "./internal/unknown.js";

export interface BuildStreamerControlStreamerDataJsonInput {
  controlId: string;
  iceId?: string;
  deviceCapability?: unknown;
}

export function buildStreamerControlStreamerDataJson(input: BuildStreamerControlStreamerDataJsonInput): string {
  const capability = input.deviceCapability ?? buildStreamerBrowserDeviceCapability();
  const record = asRecord(capability);
  const deviceCapability = input.iceId && record ? { ...record, ice_id: input.iceId } : capability;
  return JSON.stringify({ control_id: input.controlId, device_capability: deviceCapability });
}
