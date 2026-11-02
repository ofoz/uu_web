import { APP_PACKAGE, VERSION_NAME } from "./constants.js";

export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const text = String(value);
  if (text.startsWith("key_")) return text;
  if (text === APP_PACKAGE || text === VERSION_NAME) return text;
  if (/^Bearer\s+/i.test(text)) return "<redacted bearer>";
  if (/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(text)) {
    return `<redacted jwt len=${text.length}>`;
  }
  if (text.length >= 12 && /^[A-Za-z0-9._+/=:-]+$/.test(text)) {
    return `<redacted len=${text.length}>`;
  }
  return text.replace(/\d{6,}/g, "<num>");
}
