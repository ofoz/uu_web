const STREAMER_CLIPBOARD_MAX_MESSAGE_BYTES = 0x80000;

export const STREAMER_CLIPBOARD_FORMATS = { text: 1, unicodeText: 13 } as const;
export const STREAMER_CLIPBOARD_FORMAT_NAMES = { macUtf8Text: "public.utf8-plain-text" } as const;
export const STREAMER_CLIPBOARD_RESULTS = { unspecified: 0, succeeded: 1, failed: 2 } as const;

export const STREAMER_CLIPBOARD_DECODE_LIMITS = {
  maxMessageBytes: STREAMER_CLIPBOARD_MAX_MESSAGE_BYTES,
  maxTextBytes: STREAMER_CLIPBOARD_MAX_MESSAGE_BYTES - 256,
  maxFieldsPerMessage: 32,
  maxLengthDelimitedBytes: STREAMER_CLIPBOARD_MAX_MESSAGE_BYTES,
} as const;
