export const STREAMER_CONTROL_DECODE_LIMITS = Object.freeze({
  maxMessageBytes: 2 * 1024 * 1024,
  maxFieldsPerMessage: 128,
  maxLengthDelimitedBytes: 1024 * 1024,
  maxCursorImageBytes: 512 * 1024,
} as const);
