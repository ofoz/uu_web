import type {
  RemoteSignalGatewayEvent,
  RemoteSignalGatewayState,
  RemoteSignalGatewayStatus,
} from "../signalGateway/model.js";
import { getStreamerSignalControlFailure, normalizeStreamerSignalControlAck } from "./signalControl.js";
import { mapStreamerControlResultProtocolError } from "./internal/signalControlErrors.js";
import { STREAMER_SOAC_EVENT, STREAMER_SOAC_TYPES, type StreamerSoacType } from "./signalSoac.js";
import { STREAMER_CONTROL_EVENT_NAME, STREAMER_SIGNAL_SOCKET_EVENTS } from "./signalSession.js";
import { asRecord } from "./internal/unknown.js";

export type RemoteSignalReadinessStage =
  "idle" | "gateway_connected" | "control_acknowledged" | "offer_sent" | "answer_received";

export type RemoteSignalReadinessBlocker =
  | "gateway_not_connected"
  | "control_ack_missing"
  | "control_ack_failed"
  | "offer_missing"
  | "be_controlled_failed"
  | "answer_missing"
  | "controlled_left_before_answer"
  | null;

export interface RemoteSignalReadinessDiagnostics {
  stage: RemoteSignalReadinessStage;
  blocker: RemoteSignalReadinessBlocker;
  gatewayStatus: RemoteSignalGatewayState;
  gatewayError?: string;
  selectedSignalServer?: string;
  updatedAt?: string;
  lastEventAt?: string;
  terminalSignal?: {
    event: string;
    reason: "server_kick" | "publisher_disconnected" | "released";
    receivedAt: string;
    traceId?: string;
    iceIdPresent?: boolean;
    iceIdMatchesLastOffer?: boolean;
  };
  controlAckError?: {
    ackStatus?: string;
    code?: number;
    message?: string;
    protocolError?: string;
    receivedAt: string;
  };
  beControlledError?: {
    code?: number;
    message?: string;
    protocolError?: string;
    receivedAt: string;
  };
  checks: {
    signalGatewayConnected: boolean;
    controlAckReceived: boolean;
    offerSent: boolean;
    beControlledReceived: boolean;
    answerReceived: boolean;
    terminalSignalReceived: boolean;
  };
  counts: {
    outboundControl: number;
    inboundControlAck: number;
    inboundControlAckSuccess: number;
    inboundControlAckFailure: number;
    outboundOffer: number;
    outboundCandidate: number;
    inboundAnswer: number;
    inboundRestartIce: number;
    inboundCandidate: number;
    inboundBmsgPush: number;
    inboundLeave: number;
    inboundReleased: number;
    inboundBeControlled: number;
    inboundBeControlledSuccess: number;
    inboundBeControlledFailure: number;
  };
}

export interface AnalyzeRemoteSignalReadinessInput {
  events: readonly RemoteSignalGatewayEvent[];
  signalStatus?: Pick<RemoteSignalGatewayStatus, "status" | "selectedSignalServer" | "updatedAt" | "error"> | null;
}

export function analyzeRemoteSignalReadiness(
  input: AnalyzeRemoteSignalReadinessInput,
): RemoteSignalReadinessDiagnostics {
  const counts = createEmptyReadinessCounts();
  let terminalSignal: RemoteSignalReadinessDiagnostics["terminalSignal"];
  let controlAckError: RemoteSignalReadinessDiagnostics["controlAckError"];
  let beControlledError: RemoteSignalReadinessDiagnostics["beControlledError"];
  let lastOutboundOfferIceId: string | undefined;

  for (const event of input.events) {
    if (event.direction === "outbound" && event.event === STREAMER_CONTROL_EVENT_NAME) {
      counts.outboundControl += 1;
    }

    if (event.direction === "inbound" && event.event === `${STREAMER_CONTROL_EVENT_NAME}:ack`) {
      counts.inboundControlAck += 1;
      const result = extractControlAckResult(event.payload, event.receivedAt);
      if (result.ok) {
        counts.inboundControlAckSuccess += 1;
      } else {
        counts.inboundControlAckFailure += 1;
        controlAckError = result.error;
      }
    }

    if (event.event === STREAMER_SOAC_EVENT) {
      for (const type of extractStreamerSoacTypes(event.payload)) {
        if (event.direction === "outbound") {
          if (type === "offer") counts.outboundOffer += 1;
          if (type === "candidate") counts.outboundCandidate += 1;
        } else if (event.direction === "inbound") {
          if (type === "answer") counts.inboundAnswer += 1;
          if (type === "restart_ice") counts.inboundRestartIce += 1;
          if (type === "candidate") counts.inboundCandidate += 1;
        }
      }
      if (event.direction === "outbound") {
        lastOutboundOfferIceId = extractLastStreamerSoacIceId(event.payload, "offer") ?? lastOutboundOfferIceId;
      }
    }

    if (event.direction === "inbound") {
      if (event.event === STREAMER_SIGNAL_SOCKET_EVENTS.bmsgPush) {
        counts.inboundBmsgPush += 1;
      }

      if (event.event === "leave" || event.event === "left" || event.event === "publisher_disconnect") {
        counts.inboundLeave += 1;
        const iceId = extractStreamerSignalIceId(event.payload);
        terminalSignal = {
          event: event.event,
          reason: event.event === "publisher_disconnect" ? "publisher_disconnected" : "server_kick",
          receivedAt: event.receivedAt,
          traceId: extractStreamerSignalTraceId(event.payload),
          iceIdPresent: iceId !== undefined,
          iceIdMatchesLastOffer:
            iceId !== undefined && lastOutboundOfferIceId !== undefined ? iceId === lastOutboundOfferIceId : undefined,
        };
      } else if (event.event === "released") {
        counts.inboundReleased += 1;
        const iceId = extractStreamerSignalIceId(event.payload);
        terminalSignal = {
          event: event.event,
          reason: "released",
          receivedAt: event.receivedAt,
          traceId: extractStreamerSignalTraceId(event.payload),
          iceIdPresent: iceId !== undefined,
          iceIdMatchesLastOffer:
            iceId !== undefined && lastOutboundOfferIceId !== undefined ? iceId === lastOutboundOfferIceId : undefined,
        };
      } else if (event.event === "be-controlled") {
        counts.inboundBeControlled += 1;
        const result = extractBeControlledResult(event.payload, event.receivedAt);
        if (result.ok) {
          counts.inboundBeControlledSuccess += 1;
        } else {
          counts.inboundBeControlledFailure += 1;
          beControlledError = result.error;
        }
      }
    }
  }

  const signalGatewayConnected = input.signalStatus?.status === "connected";
  const controlAckReceived = counts.inboundControlAckSuccess > 0;
  const controlAckFailed = counts.inboundControlAckFailure > 0;
  const offerSent = counts.outboundOffer > 0;
  const beControlledReceived = counts.inboundBeControlledSuccess > 0;
  const beControlledFailed = counts.inboundBeControlledFailure > 0;
  const answerReceived = counts.inboundAnswer > 0 || counts.inboundRestartIce > 0;
  const terminalSignalReceived = counts.inboundLeave > 0 || counts.inboundReleased > 0;
  const gatewayHasSessionEvidence = signalGatewayConnected || input.events.length > 0;
  const { stage, blocker } = resolveReadinessStage({
    signalGatewayConnected: gatewayHasSessionEvidence,
    controlAckReceived,
    controlAckFailed,
    offerSent,
    beControlledReceived,
    beControlledFailed,
    answerReceived,
    terminalSignalReceived,
  });

  return {
    stage,
    blocker,
    gatewayStatus: input.signalStatus?.status ?? "idle",
    gatewayError: input.signalStatus?.error,
    selectedSignalServer: input.signalStatus?.selectedSignalServer,
    updatedAt: input.signalStatus?.updatedAt,
    lastEventAt: input.events.at(-1)?.receivedAt,
    terminalSignal: removeUndefinedTerminalSignalFields(terminalSignal),
    controlAckError: removeUndefinedControlAckErrorFields(controlAckError),
    beControlledError: removeUndefinedBeControlledErrorFields(beControlledError),
    checks: {
      signalGatewayConnected,
      controlAckReceived,
      offerSent,
      beControlledReceived,
      answerReceived,
      terminalSignalReceived,
    },
    counts,
  };
}

function createEmptyReadinessCounts(): RemoteSignalReadinessDiagnostics["counts"] {
  return {
    outboundControl: 0,
    inboundControlAck: 0,
    inboundControlAckSuccess: 0,
    inboundControlAckFailure: 0,
    outboundOffer: 0,
    outboundCandidate: 0,
    inboundAnswer: 0,
    inboundRestartIce: 0,
    inboundCandidate: 0,
    inboundBmsgPush: 0,
    inboundLeave: 0,
    inboundReleased: 0,
    inboundBeControlled: 0,
    inboundBeControlledSuccess: 0,
    inboundBeControlledFailure: 0,
  };
}

function resolveReadinessStage(input: {
  signalGatewayConnected: boolean;
  controlAckReceived: boolean;
  controlAckFailed: boolean;
  offerSent: boolean;
  beControlledReceived: boolean;
  beControlledFailed: boolean;
  answerReceived: boolean;
  terminalSignalReceived: boolean;
}): Pick<RemoteSignalReadinessDiagnostics, "stage" | "blocker"> {
  if (!input.signalGatewayConnected) {
    return { stage: "idle", blocker: "gateway_not_connected" };
  }

  if (!input.controlAckReceived) {
    if (input.controlAckFailed) {
      return { stage: "gateway_connected", blocker: "control_ack_failed" };
    }
    return { stage: "gateway_connected", blocker: "control_ack_missing" };
  }

  if (!input.offerSent) {
    return { stage: "control_acknowledged", blocker: "offer_missing" };
  }

  if (!input.answerReceived) {
    if (input.beControlledFailed) {
      return { stage: "offer_sent", blocker: "be_controlled_failed" };
    }
    if (input.terminalSignalReceived) {
      return { stage: "offer_sent", blocker: "controlled_left_before_answer" };
    }
    return {
      stage: "offer_sent",
      blocker: "answer_missing",
    };
  }

  return { stage: "answer_received", blocker: null };
}

function extractControlAckResult(
  payload: unknown,
  receivedAt: string,
): { ok: true } | { ok: false; error: NonNullable<RemoteSignalReadinessDiagnostics["controlAckError"]> } {
  const ack = normalizeStreamerSignalControlAck(payload);
  const failure = getStreamerSignalControlFailure(ack);
  if (!failure) return { ok: true };

  return {
    ok: false,
    error: {
      ackStatus: failure.ackStatus,
      code: failure.code,
      message: failure.msg,
      protocolError: failure.protocolError,
      receivedAt,
    },
  };
}

function extractBeControlledResult(
  payload: unknown,
  receivedAt: string,
): { ok: true } | { ok: false; error: NonNullable<RemoteSignalReadinessDiagnostics["beControlledError"]> } {
  const result = findControlResultPayload(payload);
  const code = result?.code;
  if (code === undefined || code === 0) return { ok: true };

  return {
    ok: false,
    error: {
      code,
      message: result?.message,
      protocolError: mapStreamerControlResultProtocolError(code),
      receivedAt,
    },
  };
}

function findControlResultPayload(payload: unknown): { code?: number; message?: string } | undefined {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const result = findControlResultPayload(item);
      if (result?.code !== undefined) return result;
    }
    return undefined;
  }

  const record = asRecord(payload);
  if (!record) return undefined;

  const code = typeof record.code === "number" && Number.isFinite(record.code) ? record.code : undefined;
  const message = toSafeDiagnosticString(record.msg ?? record.message);
  if (code !== undefined) return { code, message };

  return findControlResultPayload(record.data);
}

function extractStreamerSoacTypes(payload: unknown): StreamerSoacType[] {
  if (Array.isArray(payload)) {
    return payload.flatMap(extractStreamerSoacTypes);
  }

  const record = asRecord(payload);
  if (!record) return [];

  const data = record.data;
  if (Array.isArray(data)) {
    return data.flatMap(extractStreamerSoacTypes);
  }

  const dataRecord = asRecord(data);
  const directType = toStreamerSoacType(record.type);
  const dataType = toStreamerSoacType(dataRecord?.type);

  return [directType, dataType].filter((type): type is StreamerSoacType => type !== null);
}

function extractLastStreamerSoacIceId(payload: unknown, expectedType: StreamerSoacType): string | undefined {
  if (Array.isArray(payload)) {
    for (let index = payload.length - 1; index >= 0; index -= 1) {
      const iceId = extractLastStreamerSoacIceId(payload[index], expectedType);
      if (iceId) return iceId;
    }
    return undefined;
  }

  const record = asRecord(payload);
  if (!record) return undefined;

  const dataRecord = asRecord(record.data);
  const type = toStreamerSoacType(dataRecord?.type) ?? toStreamerSoacType(record.type);
  if (type !== expectedType) return undefined;

  return toSafeDiagnosticString(dataRecord?.ice_id ?? record.ice_id);
}

function toStreamerSoacType(value: unknown): StreamerSoacType | null {
  if (typeof value !== "string") return null;
  return (STREAMER_SOAC_TYPES as readonly string[]).includes(value) ? (value as StreamerSoacType) : null;
}

function extractStreamerSignalIceId(payload: unknown): string | undefined {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const iceId = extractStreamerSignalIceId(item);
      if (iceId) return iceId;
    }
    return undefined;
  }

  const record = asRecord(payload);
  if (!record) return undefined;

  const directIceId = toSafeDiagnosticString(record.ice_id ?? record.iceId);
  if (directIceId) return directIceId;
  return extractStreamerSignalIceId(record.data);
}

function extractStreamerSignalTraceId(payload: unknown): string | undefined {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const traceId = extractStreamerSignalTraceId(item);
      if (traceId) return traceId;
    }
    return undefined;
  }

  const record = asRecord(payload);
  if (!record) return undefined;

  const directTraceId = toSafeDiagnosticString(record["ntes-trace-id"] ?? record.trace_id ?? record.traceId);
  if (directTraceId) return directTraceId;
  return extractStreamerSignalTraceId(record.data);
}

function removeUndefinedTerminalSignalFields(
  terminalSignal: RemoteSignalReadinessDiagnostics["terminalSignal"],
): RemoteSignalReadinessDiagnostics["terminalSignal"] {
  if (!terminalSignal) return undefined;
  return Object.fromEntries(
    Object.entries(terminalSignal).filter(([, value]) => value !== undefined),
  ) as RemoteSignalReadinessDiagnostics["terminalSignal"];
}

function removeUndefinedControlAckErrorFields(
  error: RemoteSignalReadinessDiagnostics["controlAckError"],
): RemoteSignalReadinessDiagnostics["controlAckError"] {
  if (!error) return undefined;
  return Object.fromEntries(
    Object.entries(error).filter(([, value]) => value !== undefined),
  ) as RemoteSignalReadinessDiagnostics["controlAckError"];
}

function removeUndefinedBeControlledErrorFields(
  error: RemoteSignalReadinessDiagnostics["beControlledError"],
): RemoteSignalReadinessDiagnostics["beControlledError"] {
  if (!error) return undefined;
  return Object.fromEntries(
    Object.entries(error).filter(([, value]) => value !== undefined),
  ) as RemoteSignalReadinessDiagnostics["beControlledError"];
}

function toSafeDiagnosticString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}...` : trimmed;
}
