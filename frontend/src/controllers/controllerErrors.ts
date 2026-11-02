export function toFriendlyControllerError(message: string): string {
  const text = message || "";
  if (/Unexpected token|not valid JSON|Unexpected end of JSON|JSON at position/i.test(text)) {
    return "账号凭证 JSON 格式不正确，请检查是否完整复制。";
  }
  if (/Join a room before starting remote control|请先加入房间/i.test(text)) return "请先加入设备房间再开始远控。";
  if (/ack timed out|timed out|timeout/i.test(text)) return "连接超时，请稍后重试。";
  if (/signal control ack failed/i.test(text)) return "对端拒绝了本次连接，请稍后重试或更换网络。";
  if (/did not include a ControlResult/i.test(text)) return "未收到对端的连接许可，请重试。";
  if (/socket is not connected|is not connected|not open/i.test(text)) return "连接服务未就绪，请重新连接。";
  if (/Failed to fetch|NetworkError|ERR_NETWORK|network error/i.test(text)) return "网络异常，请检查网络后重试。";
  if (/Missing required login state/i.test(text)) return "账号凭证不完整，请重新登录。";
  return text;
}
