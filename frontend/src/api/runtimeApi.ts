import type { RuntimeProfile } from "@uurc/shared/runtimeProfile";

import { requestJson } from "./httpClient.js";

export function getRuntimeProfile(): Promise<RuntimeProfile> {
  return requestJson<RuntimeProfile>("/api/runtime");
}
