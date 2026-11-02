import {
  STREAMER_CLIPBOARD_DECODE_LIMITS,
  STREAMER_CLIPBOARD_FORMAT_NAMES,
  STREAMER_CLIPBOARD_FORMATS,
  STREAMER_CLIPBOARD_RESULTS,
} from "@uurc/shared/streamer/clipboardProtocol";
import {
  decodeStreamerClipboardMessage,
  encodeStreamerClipboardTextChangeRequest,
} from "@uurc/shared/streamer/clipboardV3";
import {
  decodeStreamerClipboardV4Message,
  encodeStreamerClipboardDataBlockConfirmResponse,
  encodeStreamerClipboardFormatDataAskRequest,
  type DecodedStreamerClipboardDataBlockRequest,
  type DecodedStreamerClipboardFormatDataConfirm,
} from "@uurc/shared/streamer/clipboardV4";
import { STREAMER_DATA_CHANNEL_LABELS, type StreamerDataChannelLabel } from "@uurc/shared/streamer/transport";
import { dataChannelPayloadBytes, summarizeDataChannelPayload } from "./dataChannel.js";
import { getErrorMessage } from "./utils.js";

interface PendingRemoteClipboardRead {
  generation: number;
  requestId: bigint;
  blockKey: string;
  blocks: Map<number, Uint8Array>;
  receivedBytes: number;
  expectedBlockCount?: number;
  startedAtMs: number;
  expiryTimer?: ReturnType<typeof setTimeout>;
  completionTimer?: ReturnType<typeof setTimeout>;
}

interface ClipboardEnvelope {
  sequence: number;
  timestampSeconds: number;
}

interface ClipboardSendEvent {
  summary: string;
  details?: Record<string, unknown>;
}

interface BrowserRemoteClipboardOptions {
  assertGeneration(generation: number): void;
  currentGeneration(): number;
  nextEnvelope(): ClipboardEnvelope;
  now(): number;
  onRemoteClipboard?(text: string): void;
  recordDebugEvent(
    kind: "data_channel" | "data_recv" | "data_send",
    summary: string,
    details?: Record<string, unknown>,
  ): void;
  sendDataChannel(label: StreamerDataChannelLabel, payload: Uint8Array, event: ClipboardSendEvent): void;
}

const CLIPBOARD_RPC_TIMEOUT_MS = 5000;
const CLIPBOARD_BLOCK_BYTES = 0x20000;
const CLIPBOARD_FULL_BLOCK_SETTLE_MS = 2000;
const MAX_CLIPBOARD_BLOCK_COUNT = 1024;

export class BrowserRemoteClipboard {
  private nextRequestId = 1n;
  private sendTail: Promise<void> = Promise.resolve();
  private pendingRead: PendingRemoteClipboardRead | undefined;
  private lastSynchronizedText: string | undefined;

  constructor(private readonly options: BrowserRemoteClipboardOptions) {}

  sendText(text: string): Promise<void> {
    const generation = this.options.currentGeneration();
    const send = this.sendTail.catch(() => undefined).then(() => this.sendTextNow(text, generation));
    this.sendTail = send.catch(() => undefined);
    return send;
  }

  requestText(): void {
    if (this.pendingRead) return;
    const generation = this.options.currentGeneration();
    this.options.assertGeneration(generation);
    const requestId = this.nextRequestId++;
    const { sequence, timestampSeconds } = this.options.nextEnvelope();
    const blockKey = `uurc-web-${generation}-${requestId}`;
    const payload = encodeStreamerClipboardFormatDataAskRequest({
      sequence,
      timestampMs: timestampSeconds,
      requestId,
      blockKey,
      formatId: 0,
      formatName: STREAMER_CLIPBOARD_FORMAT_NAMES.macUtf8Text,
    });
    const pending: PendingRemoteClipboardRead = {
      generation,
      requestId,
      blockKey,
      blocks: new Map(),
      receivedBytes: 0,
      startedAtMs: this.options.now(),
    };
    this.pendingRead = pending;
    this.refreshExpiry(pending);
    try {
      this.options.sendDataChannel(STREAMER_DATA_CHANNEL_LABELS.text, payload, {
        summary: "请求远端剪贴板内容",
        details: {
          requestId: requestId.toString(),
          sequence,
          timestampSeconds,
          formatId: 0,
          formatName: STREAMER_CLIPBOARD_FORMAT_NAMES.macUtf8Text,
        },
      });
    } catch (error) {
      this.clearPendingRead();
      throw error;
    }
  }

  cancelRead(): void {
    this.clearPendingRead();
  }

  reset(reason: string): void {
    const hadPendingRead = this.pendingRead !== undefined;
    this.clearPendingRead();
    if (hadPendingRead) {
      this.options.recordDebugEvent("data_channel", "取消未完成的远端剪贴板读取", { reason });
    }
    this.nextRequestId = 1n;
    this.lastSynchronizedText = undefined;
    this.sendTail = Promise.resolve();
  }

  handleDataMessage(label: StreamerDataChannelLabel, data: unknown): boolean {
    const bytes = dataChannelPayloadBytes(data);
    if (!bytes) return false;

    let v4Message: ReturnType<typeof decodeStreamerClipboardV4Message>;
    try {
      v4Message = decodeStreamerClipboardV4Message(bytes);
    } catch (error) {
      this.options.recordDebugEvent("data_recv", "v4 剪贴板消息解码失败", {
        label,
        error: getErrorMessage(error),
        ...summarizeDataChannelPayload(data, { includeHexPrefix: false }),
      });
      return true;
    }
    if (v4Message) {
      this.handleV4Message(label, bytes.byteLength, v4Message);
      return true;
    }

    let message: ReturnType<typeof decodeStreamerClipboardMessage>;
    try {
      message = decodeStreamerClipboardMessage(bytes);
    } catch (error) {
      this.options.recordDebugEvent("data_recv", "剪贴板消息解码失败", {
        label,
        error: getErrorMessage(error),
        ...summarizeDataChannelPayload(data, { includeHexPrefix: false }),
      });
      return true;
    }
    if (!message) return false;
    if (message.type === "text-change-response") {
      this.options.recordDebugEvent("data_recv", "收到旧版剪贴板同步响应", {
        label,
        byteLength: bytes.byteLength,
        messageType: message.type,
        sequence: message.sequence.toString(),
        timestampMs: message.timestampMs.toString(),
        requestId: message.requestId.toString(),
        result: message.result,
      });
      return true;
    }
    this.options.recordDebugEvent("data_recv", "收到远端剪贴板通知", {
      label,
      byteLength: bytes.byteLength,
      messageType: "text-changed-notification",
      sequence: message.sequence.toString(),
      timestampMs: message.timestampMs.toString(),
      requestId: message.requestId.toString(),
      formatId: message.formatId,
      textLength: message.text.length,
    });
    this.applyNotification(message.requestId, message.formatId, message.text);
    return true;
  }

  private sendTextNow(text: string, generation: number): void {
    this.options.assertGeneration(generation);
    const requestId = this.nextRequestId++;
    const { sequence, timestampSeconds } = this.options.nextEnvelope();
    const payload = encodeStreamerClipboardTextChangeRequest({
      sequence,
      timestampMs: timestampSeconds,
      requestId,
      text,
    });
    this.options.sendDataChannel(STREAMER_DATA_CHANNEL_LABELS.text, payload, {
      summary: "发送剪贴板同步请求",
      details: { requestId: requestId.toString(), sequence, timestampSeconds, textLength: text.length },
    });
    this.options.assertGeneration(generation);
    this.lastSynchronizedText = text;
  }

  private handleV4Message(
    label: StreamerDataChannelLabel,
    byteLength: number,
    message: NonNullable<ReturnType<typeof decodeStreamerClipboardV4Message>>,
  ): void {
    if (message.type === "format-data-confirm") {
      this.options.recordDebugEvent("data_recv", "收到远端剪贴板格式响应", {
        label,
        byteLength,
        requestId: message.requestId.toString(),
        result: message.result,
        blockCount: message.blockCount,
      });
      this.applyFormatConfirm(message);
      return;
    }
    if (message.type === "data-block-request") {
      this.receiveDataBlock(label, byteLength, message);
      return;
    }
    this.options.recordDebugEvent("data_recv", "收到远端剪贴板数据块响应", {
      label,
      byteLength,
      requestId: message.requestId.toString(),
      blockId: message.blockId,
      result: message.result,
    });
  }

  private applyFormatConfirm(message: DecodedStreamerClipboardFormatDataConfirm): void {
    const pending = this.pendingRead;
    if (!pending || pending.blockKey !== message.blockKey || pending.requestId !== message.requestId) {
      this.options.recordDebugEvent("data_recv", "忽略未知或已过期的远端剪贴板格式响应", {
        requestId: message.requestId.toString(),
        result: message.result,
        blockCount: message.blockCount,
      });
      return;
    }
    if (message.result !== STREAMER_CLIPBOARD_RESULTS.succeeded) {
      this.options.recordDebugEvent("data_recv", "远端剪贴板格式请求失败", {
        requestId: message.requestId.toString(),
        result: message.result,
        durationMs: Math.max(0, this.options.now() - pending.startedAtMs),
      });
      this.clearPendingRead();
      return;
    }
    if (message.blockCount > MAX_CLIPBOARD_BLOCK_COUNT) {
      this.options.recordDebugEvent("data_recv", "远端剪贴板数据块数量超限", {
        requestId: message.requestId.toString(),
        blockCount: message.blockCount,
      });
      this.clearPendingRead();
      return;
    }
    pending.expectedBlockCount = message.blockCount;
    this.refreshExpiry(pending);
    if (message.blockCount === 0) {
      this.finishRead(pending);
      return;
    }
    this.tryFinishRead(pending, true);
  }

  private receiveDataBlock(
    label: StreamerDataChannelLabel,
    byteLength: number,
    message: DecodedStreamerClipboardDataBlockRequest,
  ): void {
    const pending = this.pendingRead;
    const validBlockId = message.blockId > 0 && message.blockId <= MAX_CLIPBOARD_BLOCK_COUNT;
    const matchesPending =
      pending !== undefined &&
      pending.blockKey === message.blockKey &&
      pending.generation === this.options.currentGeneration();
    const existingBlock = matchesPending ? pending.blocks.get(message.blockId) : undefined;
    const nextByteLength = matchesPending
      ? pending.receivedBytes - (existingBlock?.byteLength ?? 0) + message.data.byteLength
      : message.data.byteLength;
    const accepted =
      matchesPending &&
      validBlockId &&
      message.data.byteLength <= CLIPBOARD_BLOCK_BYTES &&
      nextByteLength <= STREAMER_CLIPBOARD_DECODE_LIMITS.maxTextBytes;

    this.sendDataBlockConfirm(message, accepted);
    if (!accepted || !pending) {
      this.options.recordDebugEvent("data_recv", "忽略未知或无效的远端剪贴板数据块", {
        label,
        byteLength,
        requestId: message.requestId.toString(),
        blockId: message.blockId,
        dataByteLength: message.data.byteLength,
        matchesPending,
        validBlockId,
      });
      if (matchesPending && pending) this.clearPendingRead();
      return;
    }

    pending.blocks.set(message.blockId, message.data.slice());
    pending.receivedBytes = nextByteLength;
    this.refreshExpiry(pending);
    if (pending.completionTimer !== undefined) {
      clearTimeout(pending.completionTimer);
      pending.completionTimer = undefined;
    }
    this.options.recordDebugEvent("data_recv", "收到远端剪贴板数据块", {
      label,
      byteLength,
      requestId: message.requestId.toString(),
      blockId: message.blockId,
      dataByteLength: message.data.byteLength,
      receivedBlockCount: pending.blocks.size,
      expectedBlockCount: pending.expectedBlockCount,
      receivedBytes: pending.receivedBytes,
    });
    this.tryFinishRead(pending, true);
    if (this.pendingRead !== pending) return;
    if (message.data.byteLength < CLIPBOARD_BLOCK_BYTES) {
      this.tryFinishRead(pending, false);
      return;
    }
    pending.completionTimer = setTimeout(() => {
      if (this.pendingRead !== pending) return;
      pending.completionTimer = undefined;
      this.tryFinishRead(pending, false);
    }, CLIPBOARD_FULL_BLOCK_SETTLE_MS);
  }

  private sendDataBlockConfirm(message: DecodedStreamerClipboardDataBlockRequest, accepted: boolean): void {
    const { sequence, timestampSeconds } = this.options.nextEnvelope();
    const payload = encodeStreamerClipboardDataBlockConfirmResponse({
      sequence,
      timestampMs: timestampSeconds,
      requestId: message.requestId,
      blockKey: message.blockKey,
      blockId: message.blockId,
      result: accepted ? STREAMER_CLIPBOARD_RESULTS.succeeded : STREAMER_CLIPBOARD_RESULTS.failed,
    });
    try {
      this.options.sendDataChannel(STREAMER_DATA_CHANNEL_LABELS.file, payload, {
        summary: "确认远端剪贴板数据块",
        details: {
          requestId: message.requestId.toString(),
          sequence,
          timestampSeconds,
          blockId: message.blockId,
          accepted,
        },
      });
    } catch (error) {
      this.options.recordDebugEvent("data_send", "确认远端剪贴板数据块失败", {
        requestId: message.requestId.toString(),
        blockId: message.blockId,
        error: getErrorMessage(error),
      });
    }
  }

  private tryFinishRead(pending: PendingRemoteClipboardRead, requireKnownBlockCount: boolean): void {
    if (this.pendingRead !== pending) return;
    const expectedBlockCount = pending.expectedBlockCount;
    if (requireKnownBlockCount && expectedBlockCount === undefined) return;
    const blockCount = expectedBlockCount ?? pending.blocks.size;
    if (pending.blocks.size !== blockCount) return;
    for (let blockId = 1; blockId <= blockCount; blockId += 1) {
      if (!pending.blocks.has(blockId)) return;
    }
    this.finishRead(pending);
  }

  private finishRead(pending: PendingRemoteClipboardRead): void {
    if (this.pendingRead !== pending) return;
    const blockCount = pending.expectedBlockCount ?? pending.blocks.size;
    const bytes = new Uint8Array(pending.receivedBytes);
    let offset = 0;
    for (let blockId = 1; blockId <= blockCount; blockId += 1) {
      const block = pending.blocks.get(blockId);
      if (!block) return;
      bytes.set(block, offset);
      offset += block.byteLength;
    }
    let text: string;
    try {
      text = decodeUtf8Text(bytes);
    } catch (error) {
      this.options.recordDebugEvent("data_recv", "远端剪贴板文本解码失败", {
        requestId: pending.requestId.toString(),
        blockCount,
        byteLength: bytes.byteLength,
        error: getErrorMessage(error),
      });
      this.clearPendingRead();
      return;
    }
    const durationMs = Math.max(0, this.options.now() - pending.startedAtMs);
    this.clearPendingRead();
    this.options.recordDebugEvent("data_recv", "远端剪贴板读取完成", {
      requestId: pending.requestId.toString(),
      blockCount,
      byteLength: bytes.byteLength,
      textLength: text.length,
      durationMs,
    });
    this.applyNotification(pending.requestId, STREAMER_CLIPBOARD_FORMATS.text, text);
  }

  private clearPendingRead(): void {
    const pending = this.pendingRead;
    if (!pending) return;
    if (pending.expiryTimer !== undefined) clearTimeout(pending.expiryTimer);
    if (pending.completionTimer !== undefined) clearTimeout(pending.completionTimer);
    this.pendingRead = undefined;
  }

  private refreshExpiry(pending: PendingRemoteClipboardRead): void {
    if (pending.expiryTimer !== undefined) clearTimeout(pending.expiryTimer);
    pending.expiryTimer = setTimeout(() => {
      if (this.pendingRead !== pending) return;
      this.pendingRead = undefined;
      if (pending.completionTimer !== undefined) clearTimeout(pending.completionTimer);
      this.options.recordDebugEvent("data_recv", "读取远端剪贴板超时", {
        requestId: pending.requestId.toString(),
        blockCount: pending.blocks.size,
        receivedBytes: pending.receivedBytes,
        durationMs: Math.max(0, this.options.now() - pending.startedAtMs),
      });
    }, CLIPBOARD_RPC_TIMEOUT_MS);
  }

  private applyNotification(requestId: bigint, formatId: number, text: string): void {
    if (formatId !== STREAMER_CLIPBOARD_FORMATS.text && formatId !== STREAMER_CLIPBOARD_FORMATS.unicodeText) {
      this.options.recordDebugEvent("data_recv", "忽略不支持的远端剪贴板格式", {
        requestId: requestId.toString(),
        formatId,
      });
      return;
    }
    if (this.lastSynchronizedText === text) {
      this.options.recordDebugEvent("data_recv", "忽略重复的远端剪贴板", {
        requestId: requestId.toString(),
        textLength: text.length,
      });
      return;
    }
    this.lastSynchronizedText = text;
    this.options.recordDebugEvent("data_recv", "收到远端剪贴板更新", {
      requestId: requestId.toString(),
      textLength: text.length,
    });
    try {
      this.options.onRemoteClipboard?.(text);
    } catch (error) {
      this.options.recordDebugEvent("data_recv", "处理远端剪贴板更新失败", {
        requestId: requestId.toString(),
        textLength: text.length,
        error: getErrorMessage(error),
      });
    }
  }
}

function decodeUtf8Text(bytes: Uint8Array): string {
  let text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  while (text.endsWith("\0")) text = text.slice(0, -1);
  return text;
}
