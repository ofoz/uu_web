type LocalClipboardOperation = "read" | "write";

export function getLocalClipboardAccessIssue(operation: LocalClipboardOperation): string | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "当前环境不支持系统剪贴板";
  }
  if (window.isSecureContext === false) {
    return "当前页面不是安全连接，剪贴板同步需要 HTTPS 或 localhost";
  }
  const clipboard = navigator.clipboard;
  const method = operation === "read" ? clipboard?.readText : clipboard?.writeText;
  return typeof method === "function" ? null : `当前浏览器不允许${operation === "read" ? "读取" : "写入"}系统剪贴板`;
}

export async function readLocalClipboardText(): Promise<string> {
  const issue = getLocalClipboardAccessIssue("read");
  if (issue) throw new Error(issue);
  return navigator.clipboard.readText();
}

export async function writeLocalClipboardText(text: string): Promise<void> {
  const issue = getLocalClipboardAccessIssue("write");
  if (issue) throw new Error(issue);
  await navigator.clipboard.writeText(text);
}
