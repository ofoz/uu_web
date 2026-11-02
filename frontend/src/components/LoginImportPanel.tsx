import { ClipboardCheck, LoaderCircle } from "lucide-react";

export function LoginImportPanel({
  authJson,
  busy,
  onAuthJsonChange,
  onImport,
}: {
  authJson: string;
  busy: string | null;
  onAuthJsonChange: (value: string) => void;
  onImport: () => void;
}) {
  return (
    <div className="form-section login-import-panel" aria-label="导入已有账号凭证">
      <textarea
        id="auth-json"
        name="auth-json"
        value={authJson}
        onChange={(event) => onAuthJsonChange(event.target.value)}
        spellCheck={false}
        placeholder='粘贴形如 {"token":"...","userId":"...","deviceId":"..."} 的账号凭证 JSON'
      />
      <button
        className="primary-action-button wide-button"
        onClick={onImport}
        disabled={!authJson.trim() || busy !== null}
      >
        {busy === "import" ? <LoaderCircle className="spin" size={17} /> : <ClipboardCheck size={17} />}
        导入并登录
      </button>
      <p className="field-hint">凭证等同账号密码，请勿分享给他人</p>
    </div>
  );
}
