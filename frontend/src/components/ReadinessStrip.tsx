import type { RemoteSignalReadinessDiagnostics } from "@uurc/shared/streamer/readiness";

export function ReadinessStrip({ diagnostics }: { diagnostics: RemoteSignalReadinessDiagnostics }) {
  return (
    <section className="readiness-strip" aria-label="远控诊断">
      <header>
        <div>
          <span>远控诊断</span>
          <strong>{getReadinessTitle(diagnostics)}</strong>
        </div>
        <code>{diagnostics.stage}</code>
      </header>
      <div className="readiness-steps">
        <ReadinessStep
          ok={diagnostics.checks.signalGatewayConnected}
          label={diagnostics.checks.signalGatewayConnected ? "连接服务已就绪" : "等待连接服务"}
        />
        <ReadinessStep
          ok={diagnostics.checks.controlAckReceived}
          blocked={diagnostics.blocker === "control_ack_failed"}
          label={
            diagnostics.checks.controlAckReceived
              ? "连接确认已收到"
              : diagnostics.blocker === "control_ack_failed"
                ? "连接确认失败"
                : "等待连接确认"
          }
        />
        <ReadinessStep
          ok={diagnostics.checks.offerSent}
          label={diagnostics.checks.offerSent ? "offer 已发送" : "等待 offer"}
        />
        <ReadinessStep
          ok={diagnostics.checks.answerReceived || diagnostics.counts.inboundBmsgPush > 0}
          blocked={
            diagnostics.blocker === "be_controlled_failed" || diagnostics.blocker === "controlled_left_before_answer"
          }
          label={formatSignalReturnStepLabel(diagnostics)}
        />
        <ReadinessStep
          ok={diagnostics.checks.answerReceived}
          blocked={diagnostics.blocker === "controlled_left_before_answer"}
          label={
            diagnostics.checks.answerReceived
              ? "answer 已收到"
              : diagnostics.blocker === "controlled_left_before_answer"
                ? "受控端离开，未收到 answer"
                : "等待受控端 answer"
          }
        />
      </div>
      {diagnostics.terminalSignal ? (
        <p className="readiness-terminal">{formatTerminalSignal(diagnostics.terminalSignal)}</p>
      ) : null}
      {diagnostics.controlAckError ? (
        <p className="readiness-terminal">{formatControlAckError(diagnostics.controlAckError)}</p>
      ) : null}
      {diagnostics.beControlledError ? (
        <p className="readiness-terminal">{formatBeControlledError(diagnostics.beControlledError)}</p>
      ) : null}
    </section>
  );
}

function ReadinessStep({ ok, blocked = false, label }: { ok: boolean; blocked?: boolean; label: string }) {
  const stateClass = ok ? "readiness-step-ok" : blocked ? "readiness-step-blocked" : "readiness-step-wait";
  return <span className={`readiness-step ${stateClass}`}>{label}</span>;
}

function formatSignalReturnStepLabel(diagnostics: RemoteSignalReadinessDiagnostics): string {
  if (diagnostics.blocker === "be_controlled_failed") return "be-controlled 失败";
  if (diagnostics.checks.answerReceived) return "受控端 answer 已回";
  if (diagnostics.counts.inboundBmsgPush > 0) return "bmsg_push 已到";
  if (diagnostics.checks.offerSent) return "受控端回包未到达";
  return "等待受控端回包";
}

function getReadinessTitle(diagnostics: RemoteSignalReadinessDiagnostics): string {
  switch (diagnostics.blocker) {
    case "gateway_not_connected":
      return "等待连接服务";
    case "control_ack_missing":
      return "等待连接确认";
    case "control_ack_failed":
      return "连接确认失败";
    case "offer_missing":
      return "等待 offer";
    case "be_controlled_failed":
      return "be-controlled 返回失败";
    case "answer_missing":
      return "等待受控端 answer";
    case "controlled_left_before_answer":
      return "answer 未返回";
    default:
      return diagnostics.stage === "answer_received" ? "answer 已收到" : "等待远控链路";
  }
}

function formatControlAckError(error: NonNullable<RemoteSignalReadinessDiagnostics["controlAckError"]>): string {
  return [
    error.ackStatus ? `ack=${error.ackStatus}` : null,
    typeof error.code === "number" ? `code=${error.code}` : null,
    error.protocolError ? `protocol=${error.protocolError}` : null,
    error.message ? `msg=${error.message}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatBeControlledError(error: NonNullable<RemoteSignalReadinessDiagnostics["beControlledError"]>): string {
  return [
    typeof error.code === "number" ? `code=${error.code}` : null,
    error.protocolError ? `protocol=${error.protocolError}` : null,
    error.message ? `msg=${error.message}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatTerminalSignal(terminalSignal: NonNullable<RemoteSignalReadinessDiagnostics["terminalSignal"]>): string {
  return [
    getTerminalSignalReasonLabel(terminalSignal.reason),
    terminalSignal.event,
    terminalSignal.traceId,
    getTerminalSignalIceLabel(terminalSignal),
  ]
    .filter(Boolean)
    .join(" · ");
}

function getTerminalSignalIceLabel(
  terminalSignal: NonNullable<RemoteSignalReadinessDiagnostics["terminalSignal"]>,
): string | null {
  if (terminalSignal.iceIdPresent === undefined) return null;
  if (!terminalSignal.iceIdPresent) return "ice=none";
  return terminalSignal.iceIdMatchesLastOffer ? "ice=matched" : "ice=present";
}

function getTerminalSignalReasonLabel(
  reason: NonNullable<RemoteSignalReadinessDiagnostics["terminalSignal"]>["reason"],
): string {
  switch (reason) {
    case "publisher_disconnected":
      return "发布端断开";
    case "released":
      return "会话释放";
    case "server_kick":
    default:
      return "服务端断开";
  }
}
