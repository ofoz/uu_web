import { LoaderCircle, LogIn, Send } from "lucide-react";

export function LoginForm({
  busy,
  canLogin,
  canSubmitMobile,
  codeRequested,
  loginNotice,
  mobile,
  regionCode,
  smsCode,
  smsCountdown,
  onMobileChange,
  onMobileLogin,
  onRegionCodeChange,
  onSendMobileCode,
  onSmsCodeChange,
}: {
  busy: string | null;
  canLogin: boolean;
  canSubmitMobile: boolean;
  codeRequested: boolean;
  loginNotice: string;
  mobile: string;
  regionCode: string;
  smsCode: string;
  smsCountdown: number;
  onMobileChange: (value: string) => void;
  onMobileLogin: () => void;
  onRegionCodeChange: (value: string) => void;
  onSendMobileCode: () => void;
  onSmsCodeChange: (value: string) => void;
}) {
  return (
    <form
      className="form-section"
      aria-label="用手机号登录"
      onSubmit={(event) => {
        event.preventDefault();
        if (codeRequested) {
          if (canLogin) onMobileLogin();
        } else if (canSubmitMobile) {
          onSendMobileCode();
        }
      }}
    >
      <div className="inline-fields">
        <label htmlFor="region-code">
          <span>区号</span>
          <input
            id="region-code"
            name="regionCode"
            aria-label="区号"
            inputMode="numeric"
            value={regionCode}
            onChange={(event) => onRegionCodeChange(event.target.value)}
            placeholder="86"
          />
        </label>
        <label htmlFor="mobile-number">
          <span>手机号</span>
          <input
            id="mobile-number"
            name="mobile"
            aria-label="手机号"
            inputMode="tel"
            value={mobile}
            onChange={(event) => onMobileChange(event.target.value)}
            placeholder="13800000000"
          />
        </label>
      </div>
      {codeRequested ? (
        <label htmlFor="sms-code">
          <span>验证码</span>
          <input
            id="sms-code"
            name="smsCode"
            aria-label="短信验证码"
            inputMode="numeric"
            value={smsCode}
            onChange={(event) => onSmsCodeChange(event.target.value)}
            placeholder="123456"
          />
        </label>
      ) : null}
      {codeRequested ? (
        <div className="login-button-row">
          <button className="primary-action-button" type="submit" disabled={!canLogin}>
            {busy === "mobile-login" ? <LoaderCircle className="spin" size={17} /> : <LogIn size={17} />}
            登录
          </button>
          <button type="button" onClick={onSendMobileCode} disabled={!canSubmitMobile}>
            {busy === "send-mobile-code" ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
            {smsCountdown > 0 ? `重新获取 (${smsCountdown}s)` : "重新获取"}
          </button>
        </div>
      ) : (
        <button className="primary-action-button" type="submit" disabled={!canSubmitMobile}>
          {busy === "send-mobile-code" ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
          获取验证码
        </button>
      )}
      {loginNotice ? <p className="operation-note">{loginNotice}</p> : null}
    </form>
  );
}
