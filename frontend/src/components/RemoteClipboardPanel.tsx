import { ClipboardCheck, Copy, RefreshCw } from "lucide-react";

import { Switch } from "./ui/Switch.js";

export interface RemoteClipboardPanelProps {
  canCopyRemoteClipboard: boolean;
  canReadLocalClipboard: boolean;
  canSendClipboardText: boolean;
  clipboardSyncAvailable: boolean;
  clipboardSyncEnabled: boolean;
  localClipboardStatusLabel: string;
  remoteClipboardPendingText: string | null;
  remoteClipboardStatusLabel: string;
  onClipboardSyncEnabledChange: (enabled: boolean) => void;
  onCopyRemoteClipboard: () => void;
  onReadLocalClipboard: () => void;
  onSendClipboardText: () => void;
}

export function RemoteClipboardPanel({
  canCopyRemoteClipboard,
  canReadLocalClipboard,
  canSendClipboardText,
  clipboardSyncAvailable,
  clipboardSyncEnabled,
  localClipboardStatusLabel,
  remoteClipboardPendingText,
  remoteClipboardStatusLabel,
  onClipboardSyncEnabledChange,
  onCopyRemoteClipboard,
  onReadLocalClipboard,
  onSendClipboardText,
}: RemoteClipboardPanelProps) {
  return (
    <section className="metric-panel" aria-label="剪贴板">
      <Switch
        inline
        checked={clipboardSyncEnabled}
        disabled={!clipboardSyncAvailable}
        onChange={onClipboardSyncEnabledChange}
        label={
          <>
            <RefreshCw size={15} />
            同步剪贴板
          </>
        }
      />
      <div className="clipboard-direction-status" aria-live="polite">
        <p>
          <strong>本机到远端</strong>
          <span>{localClipboardStatusLabel}</span>
        </p>
        <p>
          <strong>远端到本机</strong>
          <span>{remoteClipboardStatusLabel}</span>
        </p>
      </div>
      {remoteClipboardPendingText !== null ? (
        <label className="clipboard-fallback">
          <span>收到的内容</span>
          <textarea value={remoteClipboardPendingText} readOnly rows={3} />
        </label>
      ) : null}
      <div className="panel-action-row">
        <button onClick={onReadLocalClipboard} disabled={!canReadLocalClipboard}>
          <ClipboardCheck size={16} />
          同步一次
        </button>
        <button onClick={onSendClipboardText} disabled={!canSendClipboardText}>
          <RefreshCw size={16} />
          再次发送
        </button>
        {remoteClipboardPendingText !== null ? (
          <button onClick={onCopyRemoteClipboard} disabled={!canCopyRemoteClipboard}>
            <Copy size={16} />
            复制收到内容
          </button>
        ) : null}
      </div>
    </section>
  );
}
