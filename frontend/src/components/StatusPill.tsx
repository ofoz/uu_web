interface StatusPillProps {
  state: "ready" | "warn" | "idle" | "connecting" | "danger";
  dark?: boolean;
  children: React.ReactNode;
}

export function StatusPill({ state, dark = false, children }: StatusPillProps) {
  const className = ["status-pill", `status-pill-${state}`, dark ? "status-pill-dark" : ""].filter(Boolean).join(" ");
  return (
    <span className={className}>
      <span className="status-pill-dot" aria-hidden />
      <span>{children}</span>
    </span>
  );
}
