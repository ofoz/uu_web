import { Github, TerminalSquare } from "lucide-react";
import { useState } from "react";

import { LoginForm } from "./LoginForm.js";
import { LoginImportPanel } from "./LoginImportPanel.js";
import { StatusPill } from "./StatusPill.js";
import { Tabs } from "./ui/Tabs.js";

export function LoginPage({
  authJson,
  regionCode,
  mobile,
  smsCode,
  loginNotice,
  codeSent,
  smsCountdown,
  error,
  busy,
  canSubmitMobile,
  canLogin,
  onAuthJsonChange,
  onRegionCodeChange,
  onMobileChange,
  onSmsCodeChange,
  onSendMobileCode,
  onMobileLogin,
  onImport,
}: {
  authJson: string;
  regionCode: string;
  mobile: string;
  smsCode: string;
  loginNotice: string;
  codeSent: boolean;
  smsCountdown: number;
  error: string;
  busy: string | null;
  canSubmitMobile: boolean;
  canLogin: boolean;
  onAuthJsonChange: (value: string) => void;
  onRegionCodeChange: (value: string) => void;
  onMobileChange: (value: string) => void;
  onSmsCodeChange: (value: string) => void;
  onSendMobileCode: () => void;
  onMobileLogin: () => void;
  onImport: () => void;
}) {
  const [tab, setTab] = useState("sms");
  const codeRequested = codeSent || Boolean(smsCode.trim());

  return (
    <main className="product-shell auth-product-shell">
      <header className="product-topbar">
        <div className="brand-block">
          <span className="wordmark">
            UU Remote<span className="wordmark-sub">Web</span>
          </span>
        </div>
        <StatusPill state="warn">未登录</StatusPill>
      </header>

      <section className="login-layout">
        <div className="login-actions">
          {error ? (
            <section className="error-strip" role="alert" aria-live="assertive">
              <TerminalSquare size={18} />
              <span>{error}</span>
            </section>
          ) : null}
          <div className="auth-card">
            <h1>登录 UU Remote</h1>
            <p className="auth-card-desc">
              {tab === "import"
                ? "粘贴此前导出的账号凭证，直接恢复登录。"
                : "使用手机号验证码登录，或导入已有账号凭证。"}
            </p>
            <Tabs
              ariaLabel="登录方式"
              variant="segmented"
              value={tab}
              onChange={setTab}
              items={[
                {
                  value: "sms",
                  label: "短信登录",
                  content: (
                    <LoginForm
                      busy={busy}
                      canLogin={canLogin}
                      canSubmitMobile={canSubmitMobile}
                      codeRequested={codeRequested}
                      loginNotice={loginNotice}
                      smsCountdown={smsCountdown}
                      mobile={mobile}
                      regionCode={regionCode}
                      smsCode={smsCode}
                      onMobileChange={onMobileChange}
                      onMobileLogin={onMobileLogin}
                      onRegionCodeChange={onRegionCodeChange}
                      onSendMobileCode={onSendMobileCode}
                      onSmsCodeChange={onSmsCodeChange}
                    />
                  ),
                },
                {
                  value: "import",
                  label: "导入凭证",
                  content: (
                    <LoginImportPanel
                      authJson={authJson}
                      busy={busy}
                      onAuthJsonChange={onAuthJsonChange}
                      onImport={onImport}
                    />
                  ),
                },
              ]}
            />
          </div>
        </div>
      </section>

      <footer className="app-footer">
        <a className="repo-link" href="https://github.com/iola1999/uurc-web" target="_blank" rel="noreferrer">
          <Github size={14} />
          开源于 GitHub · iola1999/uurc-web · 欢迎 Star
        </a>
      </footer>
    </main>
  );
}
