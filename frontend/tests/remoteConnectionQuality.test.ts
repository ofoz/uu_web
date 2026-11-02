import { describe, expect, it } from "vitest";

import type {
  BrowserRemoteSessionState,
  BrowserRemoteVideoFlowDiagnostics,
} from "../src/remote/browserRemoteSessionTypes.js";
import { getRemoteConnectionQuality } from "../src/remote/remoteConnectionQuality.js";

function createConnectedState(
  status: BrowserRemoteVideoFlowDiagnostics["status"],
  detail: string,
): BrowserRemoteSessionState {
  return {
    appControlId: "app-1",
    connectionPath: "direct",
    dataChannels: {},
    debugEvents: [],
    remoteTrackCount: 1,
    stage: "connected",
    videoFlow: {
      status,
      title: status,
      detail,
      updatedAtMs: 1_000,
    },
  };
}

describe("getRemoteConnectionQuality", () => {
  it.each([
    ["decode_stalled", "decoder stopped advancing"],
    ["presentation_stalled", "browser stopped presenting frames"],
  ] satisfies Array<[BrowserRemoteVideoFlowDiagnostics["status"], string]>)(
    "reports %s as a video warning",
    (status, detail) => {
      const quality = getRemoteConnectionQuality({
        state: createConnectedState(status, detail),
        controlChannelState: "open",
        inputControlActive: true,
        textChannelState: "open",
        connectionPathLabel: "直连",
      });

      expect(quality).toMatchObject({
        state: "warn",
        title: "画面卡顿",
        detail,
      });
    },
  );
});
