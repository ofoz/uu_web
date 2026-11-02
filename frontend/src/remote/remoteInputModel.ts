import type { KeyboardEvent } from "react";

import type { StreamerMouseButtonKind } from "@uurc/shared/streamer/inputDesktop";

import { toAndroidKeyCodeFromDomEvent } from "./androidKeyCodes.js";

export function toRemoteMouseButton(button: number): StreamerMouseButtonKind {
  if (button === 1) return "tertiary";
  if (button === 2) return "secondary";
  if (button === 3) return "back";
  if (button === 4) return "forward";
  return "primary";
}

export function toRemoteKeyValue(event: KeyboardEvent): string | number {
  return toAndroidKeyCodeFromDomEvent(event);
}
