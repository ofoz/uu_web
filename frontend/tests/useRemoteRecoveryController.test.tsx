import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useRemoteRecoveryController } from "../src/controllers/useRemoteRecoveryController.js";
import type {
  BrowserRemoteSessionState,
  BrowserRemoteVideoFlowDiagnostics,
} from "../src/remote/browserRemoteSessionTypes.js";

describe("useRemoteRecoveryController", () => {
  it.each(["decode_stalled", "presentation_stalled"] as const)(
    "treats two consecutive %s samples as recoverable",
    (status) => {
      const { result, rerender } = renderHook(
        ({ browserRemoteState }) =>
          useRemoteRecoveryController({
            autoReconnectEnabled: false,
            browserRemoteState,
            busy: null,
            controlChannelState: "open",
            roomJoinedForSelectedDevice: true,
            signalGatewayMatchesRoom: true,
            onReconnect: vi.fn(),
          }),
        {
          initialProps: {
            browserRemoteState: createState({
              status: "receiving",
              updatedAtMs: 1_000,
            }),
          },
        },
      );

      rerender({
        browserRemoteState: createState({
          status,
          updatedAtMs: 2_000,
        }),
      });
      expect(result.current.decodeStalledStreak).toBe(1);
      expect(result.current.browserConnectionRecoverable).toBe(false);

      rerender({
        browserRemoteState: createState({
          status,
          updatedAtMs: 3_000,
        }),
      });
      expect(result.current.decodeStalledStreak).toBe(2);
      expect(result.current.browserConnectionRecoverable).toBe(true);
    },
  );
});

function createState(
  videoFlow: Pick<BrowserRemoteVideoFlowDiagnostics, "status" | "updatedAtMs">,
): BrowserRemoteSessionState {
  return {
    appControlId: "test-app-control",
    connectionPath: "direct",
    dataChannels: {},
    debugEvents: [],
    remoteTrackCount: 1,
    stage: "connected",
    videoFlow: {
      ...videoFlow,
      title: videoFlow.status,
      detail: videoFlow.status,
    },
  };
}
