import { describe, expect, it } from "vitest";

import { analyzeRemoteSignalReadiness } from "../src/streamer/readiness.js";

describe("streamer readiness", () => {
  it("diagnoses a wire-shaped control ack followed by offer and leave as missing controlled answer", () => {
    const diagnostics = analyzeRemoteSignalReadiness({
      signalStatus: {
        status: "connected",
        selectedSignalServer: "wss://signal.example",
        updatedAt: "2026-05-15T00:00:04.000Z",
      },
      events: [
        {
          id: 1,
          direction: "outbound",
          event: "control",
          receivedAt: "2026-05-15T00:00:00.000Z",
          payload: { app_control_id: "control-1" },
        },
        {
          id: 2,
          direction: "inbound",
          event: "control:ack",
          receivedAt: "2026-05-15T00:00:00.050Z",
          payload: ["success", { code: 0 }],
        },
        {
          id: 3,
          direction: "outbound",
          event: "soac",
          receivedAt: "2026-05-15T00:00:00.100Z",
          payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
        },
        {
          id: 4,
          direction: "outbound",
          event: "soac",
          receivedAt: "2026-05-15T00:00:00.200Z",
          payload: { client_id: "controlled-1", data: { type: "candidate" } },
        },
        {
          id: 5,
          direction: "inbound",
          event: "leave",
          receivedAt: "2026-05-15T00:00:01.000Z",
          payload: [{ ice_id: "ice-1", "ntes-trace-id": "trace-server-kick-1" }],
        },
      ],
    });

    expect(diagnostics).toMatchObject({
      stage: "offer_sent",
      blocker: "controlled_left_before_answer",
      selectedSignalServer: "wss://signal.example",
      checks: {
        signalGatewayConnected: true,
        controlAckReceived: true,
        offerSent: true,
        answerReceived: false,
        terminalSignalReceived: true,
      },
      counts: {
        outboundControl: 1,
        inboundControlAck: 1,
        outboundOffer: 1,
        outboundCandidate: 1,
        inboundAnswer: 0,
        inboundLeave: 1,
      },
      lastEventAt: "2026-05-15T00:00:01.000Z",
      terminalSignal: {
        event: "leave",
        reason: "server_kick",
        traceId: "trace-server-kick-1",
        iceIdPresent: true,
        iceIdMatchesLastOffer: true,
        receivedAt: "2026-05-15T00:00:01.000Z",
      },
    });
  });

  it("keeps diagnosing the last signal session after the gateway is stopped", () => {
    const diagnostics = analyzeRemoteSignalReadiness({
      signalStatus: {
        status: "closed",
        selectedSignalServer: "wss://signal.example",
        updatedAt: "2026-05-15T00:00:04.000Z",
      },
      events: [
        {
          id: 1,
          direction: "outbound",
          event: "control",
          receivedAt: "2026-05-15T00:00:00.000Z",
          payload: { app_control_id: "control-1" },
        },
        {
          id: 2,
          direction: "inbound",
          event: "control:ack",
          receivedAt: "2026-05-15T00:00:00.050Z",
          payload: ["success", { code: 0 }],
        },
        {
          id: 3,
          direction: "outbound",
          event: "soac",
          receivedAt: "2026-05-15T00:00:00.100Z",
          payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
        },
        {
          id: 4,
          direction: "inbound",
          event: "leave",
          receivedAt: "2026-05-15T00:00:01.000Z",
          payload: [{ ice_id: "ice-1", "ntes-trace-id": "trace-server-kick-1" }],
        },
      ],
    });

    expect(diagnostics).toMatchObject({
      stage: "offer_sent",
      blocker: "controlled_left_before_answer",
      checks: {
        signalGatewayConnected: false,
        controlAckReceived: true,
        offerSent: true,
        terminalSignalReceived: true,
      },
      terminalSignal: {
        event: "leave",
        iceIdMatchesLastOffer: true,
      },
    });
  });

  it("treats nonzero control ack ControlResult as a failed control gate", () => {
    const diagnostics = analyzeRemoteSignalReadiness({
      signalStatus: {
        status: "connected",
        selectedSignalServer: "wss://signal.example",
        updatedAt: "2026-05-15T00:00:01.000Z",
      },
      events: [
        {
          id: 1,
          direction: "outbound",
          event: "control",
          receivedAt: "2026-05-15T00:00:00.000Z",
          payload: { app_control_id: "control-1" },
        },
        {
          id: 2,
          direction: "inbound",
          event: "control:ack",
          receivedAt: "2026-05-15T00:00:00.050Z",
          payload: ["fail", { code: 100002, msg: "rejected" }],
        },
      ],
    });

    expect(diagnostics).toMatchObject({
      stage: "gateway_connected",
      blocker: "control_ack_failed",
      checks: {
        controlAckReceived: false,
        offerSent: false,
      },
      counts: {
        inboundControlAck: 1,
        inboundControlAckSuccess: 0,
        inboundControlAckFailure: 1,
      },
      controlAckError: {
        ackStatus: "fail",
        code: 100002,
        message: "rejected",
        protocolError: "protocol_error_2022",
        receivedAt: "2026-05-15T00:00:00.050Z",
      },
    });
  });

  it("diagnoses missing controller-side answer without waiting for controlled-side be-controlled", () => {
    const baseEvents = [
      {
        id: 1,
        direction: "outbound",
        event: "control",
        receivedAt: "2026-05-15T00:00:00.000Z",
        payload: { app_control_id: "control-1" },
      },
      {
        id: 2,
        direction: "inbound",
        event: "control:ack",
        receivedAt: "2026-05-15T00:00:00.050Z",
        payload: ["success", { code: 0 }],
      },
      {
        id: 3,
        direction: "outbound",
        event: "soac",
        receivedAt: "2026-05-15T00:00:00.100Z",
        payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
      },
    ] as const;

    const beforeAnswer = analyzeRemoteSignalReadiness({
      signalStatus: { status: "connected", updatedAt: "2026-05-15T00:00:01.000Z" },
      events: baseEvents,
    });
    const afterUnexpectedBeControlled = analyzeRemoteSignalReadiness({
      signalStatus: { status: "connected", updatedAt: "2026-05-15T00:00:02.000Z" },
      events: [
        ...baseEvents,
        {
          id: 4,
          direction: "inbound",
          event: "bmsg_push",
          receivedAt: "2026-05-15T00:00:00.145Z",
          payload: [{ type: "be-controlled", data: { code: 0 } }],
        },
        {
          id: 5,
          direction: "inbound",
          event: "be-controlled",
          receivedAt: "2026-05-15T00:00:00.150Z",
          payload: [{ code: 0 }],
        },
      ],
    });

    expect(beforeAnswer).toMatchObject({
      stage: "offer_sent",
      blocker: "answer_missing",
      checks: {
        beControlledReceived: false,
        answerReceived: false,
      },
      counts: {
        inboundBeControlled: 0,
      },
    });
    expect(afterUnexpectedBeControlled).toMatchObject({
      stage: "offer_sent",
      blocker: "answer_missing",
      checks: {
        beControlledReceived: true,
        answerReceived: false,
      },
      counts: {
        inboundBeControlled: 1,
        inboundBmsgPush: 1,
      },
    });
  });

  it("treats nonzero be-controlled ControlResult as a failed control gate", () => {
    const diagnostics = analyzeRemoteSignalReadiness({
      signalStatus: { status: "connected", updatedAt: "2026-05-15T00:00:02.000Z" },
      events: [
        {
          id: 1,
          direction: "outbound",
          event: "control",
          receivedAt: "2026-05-15T00:00:00.000Z",
          payload: { app_control_id: "control-1" },
        },
        {
          id: 2,
          direction: "inbound",
          event: "control:ack",
          receivedAt: "2026-05-15T00:00:00.050Z",
          payload: ["success", { code: 0 }],
        },
        {
          id: 3,
          direction: "outbound",
          event: "soac",
          receivedAt: "2026-05-15T00:00:00.100Z",
          payload: { client_id: "controlled-1", data: { type: "offer", ice_id: "ice-1" } },
        },
        {
          id: 4,
          direction: "inbound",
          event: "be-controlled",
          receivedAt: "2026-05-15T00:00:00.150Z",
          payload: [{ code: 100001, msg: "occupied" }],
        },
      ],
    });

    expect(diagnostics).toMatchObject({
      stage: "offer_sent",
      blocker: "be_controlled_failed",
      checks: {
        beControlledReceived: false,
        answerReceived: false,
      },
      counts: {
        inboundBeControlled: 1,
        inboundBeControlledSuccess: 0,
        inboundBeControlledFailure: 1,
      },
      beControlledError: {
        code: 100001,
        message: "occupied",
        protocolError: "protocol_error_2021",
        receivedAt: "2026-05-15T00:00:00.150Z",
      },
    });
  });
});
