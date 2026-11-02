import { Handshake, Info, KeyRound, LoaderCircle } from "lucide-react";

import { preloadRemoteControlRoute } from "../routeLoaders.js";

export function RemoteAssistanceCard({
  busy,
  connectCode,
  connectId,
  notice,
  onConnectCodeChange,
  onConnectIdChange,
  onStart,
}: {
  busy: string | null;
  connectCode: string;
  connectId: string;
  notice: string;
  onConnectCodeChange: (value: string) => void;
  onConnectIdChange: (value: string) => void;
  onStart: () => void;
}) {
  const submitting = busy === "assistance";
  const disabled = busy !== null || connectId.trim().length === 0;

  return (
    <section aria-labelledby="remote-assistance-title">
      <div className="assistance-header">
        <span className="assistance-icon" aria-hidden="true">
          <Handshake size={19} />
        </span>
        <div>
          <h2 id="remote-assistance-title">远控伙伴设备</h2>
          <p>通过伙伴的设备 ID 和设备验证码发起远程协助。</p>
        </div>
      </div>

      <form
        className="assistance-form"
        onFocusCapture={preloadRemoteControlRoute}
        onMouseEnter={preloadRemoteControlRoute}
        onPointerDown={preloadRemoteControlRoute}
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) onStart();
        }}
      >
        <label>
          <span>伙伴的设备 ID</span>
          <input
            autoComplete="off"
            inputMode="numeric"
            maxLength={12}
            onChange={(event) => onConnectIdChange(event.target.value.replace(/\D/g, ""))}
            placeholder="6-12 位数字"
            value={connectId}
          />
        </label>

        <label>
          <span>
            设备验证码 <span className="assistance-optional">· 可留空</span>
          </span>
          <input
            autoCapitalize="characters"
            autoComplete="one-time-code"
            onChange={(event) => onConnectCodeChange(event.target.value.trim())}
            placeholder="留空时由对方在设备上确认"
            spellCheck={false}
            value={connectCode}
          />
        </label>

        <button className="primary-action-button" disabled={disabled} type="submit">
          {submitting ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}
          发起连接
        </button>

        <div className="assistance-hint">
          <Info size={13} aria-hidden="true" />
          <span>
            {notice || "验证码留空：对方需在其设备上点「确认」；若对方设置了验证码，向对方索取后填入即可直连。"}
          </span>
        </div>
      </form>
    </section>
  );
}
