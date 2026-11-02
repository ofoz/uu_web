import type { BrowserRemoteDebugEvent } from "../remote/browserRemoteSessionTypes.js";

export function DebugEventList({ events }: { events: readonly BrowserRemoteDebugEvent[] }) {
  if (events.length === 0) {
    return <p className="empty-debug-log">暂无调试事件。</p>;
  }
  const newestFirst = [...events].reverse();
  return (
    <ol className="debug-event-list">
      {newestFirst.map((event) => (
        <li key={event.id}>
          <span>{formatDebugTime(event.atMs)}</span>
          <strong>{event.summary}</strong>
          <code>{event.kind}</code>
          {event.details ? <pre>{JSON.stringify(event.details, null, 2)}</pre> : null}
        </li>
      ))}
    </ol>
  );
}

function formatDebugTime(atMs: number): string {
  return new Date(atMs).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
