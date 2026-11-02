import { Copy, LoaderCircle, LogOut } from "lucide-react";

import type { AuthStatus } from "@uurc/shared/authState";

import { StatusRow } from "./Panel.js";
import { AnimatedDisclosure } from "./ui/AnimatedDisclosure.js";

// Token 到期：JWT 无 exp 声明时显示“长期有效”，有则本地化为可读时间并标注是否过期。
function formatTokenExpiry(authStatus: AuthStatus | null): string {
  if (!authStatus?.tokenExpiresAt) return "长期有效（无到期声明）";
  const date = new Date(authStatus.tokenExpiresAt);
  if (Number.isNaN(date.getTime())) return authStatus.tokenExpiresAt;
  const formatted = date.toLocaleString();
  return authStatus.tokenExpired ? `${formatted}（已过期）` : formatted;
}

export function DeviceAccountPanel({
  authJson,
  authStatus,
  busy,
  identityDeviceLabel,
  identitySourceLabel,
  onCopyAuthJson,
  onLogout,
}: {
  authJson: string;
  authStatus: AuthStatus | null;
  busy: string | null;
  identityDeviceLabel: string;
  identitySourceLabel: string;
  onCopyAuthJson: () => void;
  onLogout: () => void;
}) {
  return (
    <section aria-label="账号与凭证">
      <div className="identity-summary">
        <div>
          <span>身份</span>
          <strong>{identitySourceLabel}</strong>
        </div>
        <div>
          <span>本机控制端</span>
          <strong>{identityDeviceLabel}</strong>
        </div>
        <div>
          <span>渠道</span>
          <strong>{authStatus?.channel ?? "-"}</strong>
        </div>
        <div>
          <span>Token 到期</span>
          <strong>{formatTokenExpiry(authStatus)}</strong>
        </div>
      </div>

      <div className="button-row account-actions">
        <button className="secondary-button" onClick={onCopyAuthJson} disabled={busy !== null}>
          <Copy size={17} />
          复制凭证 JSON
        </button>
        <span className="account-actions-spacer" />
        <button className="danger-button" onClick={onLogout} disabled={busy !== null}>
          {busy === "logout" ? <LoaderCircle className="spin" size={17} /> : <LogOut size={17} />}
          退出登录
        </button>
      </div>

      {authJson.trim() ? (
        <AnimatedDisclosure className="identity-details export-details" defaultOpen summary="账号凭证备份（JSON）">
          <label className="field-label" htmlFor="auth-json-export">
            账号凭证 JSON
          </label>
          <textarea id="auth-json-export" name="auth-json-export" value={authJson} readOnly spellCheck={false} />
        </AnimatedDisclosure>
      ) : null}

      <AnimatedDisclosure className="identity-details" summary="账号详情">
        <div className="status-list compact">
          <StatusRow label="用户" value={authStatus?.userId ?? "-"} />
          <StatusRow label="客户端" value={authStatus?.clientId ?? "-"} />
          <StatusRow label="网页设备" value={authStatus?.deviceId ?? "-"} />
        </div>
      </AnimatedDisclosure>

      <p className="field-hint">妥善保管凭证：任何人拿到它即可登录你的账号。可在其他设备的「导入凭证」中粘贴恢复。</p>
    </section>
  );
}
