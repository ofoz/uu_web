import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { getLocalClipboardAccessIssue, readLocalClipboardText, writeLocalClipboardText } from "../browser/clipboard.js";
import type { BrowserRemoteSession } from "../remote/browserRemoteSession.js";
import type { BrowserRemoteSessionState } from "../remote/browserRemoteSessionTypes.js";

const RESUME_READ_THROTTLE_MS = 500;
const REMOTE_CLIPBOARD_INITIAL_POLL_DELAY_MS = 1200;
const REMOTE_CLIPBOARD_POLL_INTERVAL_MS = 2000;

interface UseRemoteClipboardControllerOptions {
  browserSessionRef: RefObject<BrowserRemoteSession | null>;
  sessionKey: string;
  fileChannelState: RTCDataChannelState;
  remoteClipboardReadEnabled: boolean;
  textChannelState: RTCDataChannelState;
  onError(message: string): void;
  onSessionStateChange(state: BrowserRemoteSessionState): void;
  showToast(message: string): void;
}

interface RemoteClipboardFallback {
  id: number;
  text: string;
}

interface RemoteClipboardUiState {
  enabled: boolean;
  localText: string | null;
  localStatus: string;
  remoteFallback: RemoteClipboardFallback | null;
  remoteStatus: string;
  reading: boolean;
  sending: boolean;
  copying: boolean;
}

export function useRemoteClipboardController({
  browserSessionRef,
  sessionKey,
  fileChannelState,
  remoteClipboardReadEnabled,
  textChannelState,
  onError,
  onSessionStateChange,
  showToast,
}: UseRemoteClipboardControllerOptions) {
  const [state, setState] = useState<RemoteClipboardUiState>(createInitialState);
  const generationRef = useRef(0);
  const enabledRevisionRef = useRef(0);
  const preferredEnabledRef = useRef(true);
  const syncEnabledRef = useRef(true);
  const autoReadAllowedRef = useRef(false);
  const readInFlightRef = useRef<Promise<void> | null>(null);
  const readSequenceRef = useRef(0);
  const sendSequenceRef = useRef(0);
  const remoteWriteSequenceRef = useRef(0);
  const remoteWriteTailRef = useRef(Promise.resolve());
  const synchronizedTextRef = useRef<{ hasValue: boolean; text: string }>({ hasValue: false, text: "" });
  const lastResumeReadAtRef = useRef(0);
  const previousSessionKeyRef = useRef(sessionKey);
  const clipboardChannelsOpenedRef = useRef(false);
  const clipboardChannelsOpenRef = useRef(false);
  clipboardChannelsOpenRef.current = textChannelState === "open" && fileChannelState === "open";

  const readIssue = getLocalClipboardAccessIssue("read");
  const writeIssue = getLocalClipboardAccessIssue("write");
  const clipboardSyncAvailable = clipboardChannelsOpenRef.current && !readIssue && !writeIssue;

  const resetClipboardSession = useCallback((): void => {
    generationRef.current += 1;
    enabledRevisionRef.current += 1;
    const enabled = preferredEnabledRef.current;
    syncEnabledRef.current = enabled;
    autoReadAllowedRef.current = false;
    readInFlightRef.current = null;
    readSequenceRef.current += 1;
    sendSequenceRef.current += 1;
    remoteWriteSequenceRef.current += 1;
    remoteWriteTailRef.current = Promise.resolve();
    synchronizedTextRef.current = { hasValue: false, text: "" };
    lastResumeReadAtRef.current = 0;
    clipboardChannelsOpenedRef.current = false;
    browserSessionRef.current?.cancelRemoteClipboardRead();
    setState(createInitialState(enabled));
  }, [browserSessionRef]);

  useEffect(() => {
    if (previousSessionKeyRef.current === sessionKey) return;
    previousSessionKeyRef.current = sessionKey;
    resetClipboardSession();
  }, [resetClipboardSession, sessionKey]);

  useEffect(() => {
    syncEnabledRef.current = preferredEnabledRef.current;
    return () => {
      generationRef.current += 1;
      enabledRevisionRef.current += 1;
      syncEnabledRef.current = false;
      autoReadAllowedRef.current = false;
      readInFlightRef.current = null;
      readSequenceRef.current += 1;
      sendSequenceRef.current += 1;
      remoteWriteSequenceRef.current += 1;
      remoteWriteTailRef.current = Promise.resolve();
      clipboardChannelsOpenedRef.current = false;
    };
  }, []);

  const sendClipboardText = useCallback(
    async (text: string): Promise<void> => {
      const session = browserSessionRef.current;
      if (!session || !clipboardChannelsOpenRef.current) {
        setState((current) => ({ ...current, sending: false, localStatus: "剪贴板连接尚未就绪" }));
        return;
      }

      const generation = generationRef.current;
      const enabledRevision = enabledRevisionRef.current;
      const sequence = ++sendSequenceRef.current;
      setState((current) => ({
        ...current,
        localText: text,
        localStatus: `正在同步到远端（${text.length} 字符）`,
        sending: true,
      }));
      try {
        await session.sendClipboardText(text);
        if (!isCurrentOperation(generationRef, enabledRevisionRef, generation, enabledRevision)) return;
        if (browserSessionRef.current !== session || sendSequenceRef.current !== sequence) return;
        synchronizedTextRef.current = { hasValue: true, text };
        setState((current) => ({
          ...current,
          localStatus: `已同步到远端（${text.length} 字符）`,
          sending: false,
        }));
        showToast("剪贴板已同步到远端");
        onSessionStateChange(session.getState());
      } catch (caught) {
        if (!isCurrentOperation(generationRef, enabledRevisionRef, generation, enabledRevision)) return;
        if (browserSessionRef.current !== session || sendSequenceRef.current !== sequence) return;
        const message = errorMessage(caught);
        setState((current) => ({
          ...current,
          localStatus: `发送失败：${message}`,
          sending: false,
        }));
        if (!isAbortError(caught)) onError(message);
      }
    },
    [browserSessionRef, onError, onSessionStateChange, showToast],
  );

  const readClipboard = useCallback(
    (source: "user" | "resume", sendAfterRead: boolean): Promise<void> => {
      if (readInFlightRef.current) return readInFlightRef.current;
      const generation = generationRef.current;
      const enabledRevision = enabledRevisionRef.current;
      const sequence = ++readSequenceRef.current;
      setState((current) => ({ ...current, reading: true, localStatus: "正在读取本机剪贴板" }));

      const task = (async () => {
        try {
          const text = await readLocalClipboardText();
          if (!isCurrentOperation(generationRef, enabledRevisionRef, generation, enabledRevision)) return;
          if (readSequenceRef.current !== sequence) return;
          autoReadAllowedRef.current = true;
          const shouldSend = sendAfterRead || syncEnabledRef.current;
          setState((current) => ({
            ...current,
            localText: text,
            localStatus: shouldSend ? `已读取 ${text.length} 字符，等待同步` : `已读取 ${text.length} 字符，等待发送`,
            reading: false,
          }));
          if (!shouldSend) return;
          if (
            source === "resume" &&
            synchronizedTextRef.current.hasValue &&
            synchronizedTextRef.current.text === text
          ) {
            setState((current) => ({
              ...current,
              localStatus: `本机剪贴板未变化（${text.length} 字符）`,
            }));
            return;
          }
          await sendClipboardText(text);
        } catch (caught) {
          if (!isCurrentOperation(generationRef, enabledRevisionRef, generation, enabledRevision)) return;
          if (readSequenceRef.current !== sequence) return;
          autoReadAllowedRef.current = false;
          const message = errorMessage(caught);
          setState((current) => ({
            ...current,
            localStatus:
              source === "resume" ? `自动读取失败，请点击同步一次后重试：${message}` : `读取失败：${message}`,
            reading: false,
          }));
        } finally {
          if (
            isCurrentOperation(generationRef, enabledRevisionRef, generation, enabledRevision) &&
            readSequenceRef.current === sequence
          ) {
            readInFlightRef.current = null;
          }
        }
      })();
      readInFlightRef.current = task;
      return task;
    },
    [sendClipboardText],
  );

  useEffect(() => {
    const channelsOpen = textChannelState === "open" && fileChannelState === "open";
    if (channelsOpen) {
      if (clipboardChannelsOpenedRef.current) return;
      clipboardChannelsOpenedRef.current = true;
      if (syncEnabledRef.current && !readIssue) void readClipboard("resume", true);
      return;
    }
    if (!clipboardChannelsOpenedRef.current) return;
    clipboardChannelsOpenedRef.current = false;
    resetClipboardSession();
  }, [fileChannelState, readClipboard, readIssue, resetClipboardSession, sessionKey, textChannelState]);

  useEffect(() => {
    if (!state.enabled || !remoteClipboardReadEnabled || textChannelState !== "open" || fileChannelState !== "open") {
      return;
    }
    const session = browserSessionRef.current;
    if (!session) return;

    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const requestRemoteClipboard = (): void => {
      if (
        browserSessionRef.current !== session ||
        !syncEnabledRef.current ||
        readInFlightRef.current ||
        document.visibilityState === "hidden"
      ) {
        return;
      }
      try {
        session.requestRemoteClipboardText();
      } catch {
        // Channel state changes are reflected by the session state callback and retried after reconnect.
      }
    };
    const initialTimer = setTimeout(() => {
      requestRemoteClipboard();
      pollTimer = setInterval(requestRemoteClipboard, REMOTE_CLIPBOARD_POLL_INTERVAL_MS);
    }, REMOTE_CLIPBOARD_INITIAL_POLL_DELAY_MS);

    return () => {
      clearTimeout(initialTimer);
      if (pollTimer !== undefined) clearInterval(pollTimer);
      session.cancelRemoteClipboardRead();
    };
  }, [browserSessionRef, fileChannelState, remoteClipboardReadEnabled, sessionKey, state.enabled, textChannelState]);

  useEffect(() => {
    if (!state.enabled) return;
    const tryResumeSync = (): void => {
      if (document.visibilityState === "hidden" || !autoReadAllowedRef.current) return;
      const now = Date.now();
      if (now - lastResumeReadAtRef.current < RESUME_READ_THROTTLE_MS) return;
      lastResumeReadAtRef.current = now;
      void readClipboard("resume", true);
    };
    const handleVisibilityChange = (): void => {
      if (!document.hidden) tryResumeSync();
    };
    window.addEventListener("focus", tryResumeSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", tryResumeSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [readClipboard, state.enabled]);

  function handleClipboardSyncEnabledChange(enabled: boolean): void {
    if (enabled && !clipboardSyncAvailable) return;
    enabledRevisionRef.current += 1;
    preferredEnabledRef.current = enabled;
    syncEnabledRef.current = enabled;
    autoReadAllowedRef.current = false;
    readInFlightRef.current = null;
    readSequenceRef.current += 1;
    sendSequenceRef.current += 1;
    remoteWriteSequenceRef.current += 1;
    remoteWriteTailRef.current = Promise.resolve();
    if (!enabled) browserSessionRef.current?.cancelRemoteClipboardRead();
    setState((current) => ({
      ...current,
      enabled,
      localText: enabled ? current.localText : null,
      localStatus: enabled ? "正在读取本机剪贴板" : initialLocalStatus(),
      remoteFallback: null,
      remoteStatus: initialRemoteStatus(),
      reading: false,
      sending: false,
      copying: false,
    }));
    if (enabled) void readClipboard("user", true);
  }

  function handleReadLocalClipboard(): void {
    void readClipboard("user", true);
  }

  function handleSendClipboardText(): void {
    if (state.localText === null || state.sending) return;
    void sendClipboardText(state.localText);
  }

  const handleRemoteClipboard = useCallback((text: string): void => {
    if (!syncEnabledRef.current) return;
    autoReadAllowedRef.current = false;
    readInFlightRef.current = null;
    readSequenceRef.current += 1;
    sendSequenceRef.current += 1;
    synchronizedTextRef.current = { hasValue: true, text };
    const generation = generationRef.current;
    const enabledRevision = enabledRevisionRef.current;
    const sequence = ++remoteWriteSequenceRef.current;
    setState((current) => ({
      ...current,
      localStatus: current.reading || current.sending ? "本机同步已取消，以远端更新为准" : current.localStatus,
      reading: false,
      sending: false,
      remoteFallback: null,
      remoteStatus: `已收到远端剪贴板（${text.length} 字符），正在写入本机`,
    }));

    const previousTail = remoteWriteTailRef.current;
    const task = previousTail
      .catch(() => undefined)
      .then(async () => {
        if (!isCurrentOperation(generationRef, enabledRevisionRef, generation, enabledRevision)) return;
        try {
          await writeLocalClipboardText(text);
          if (!isCurrentOperation(generationRef, enabledRevisionRef, generation, enabledRevision)) return;
          if (remoteWriteSequenceRef.current !== sequence) return;
          autoReadAllowedRef.current = true;
          setState((current) => ({
            ...current,
            remoteFallback: null,
            remoteStatus: `已同步到本机（${text.length} 字符）`,
          }));
        } catch (caught) {
          if (!isCurrentOperation(generationRef, enabledRevisionRef, generation, enabledRevision)) return;
          if (remoteWriteSequenceRef.current !== sequence) return;
          setState((current) => ({
            ...current,
            remoteFallback: { id: sequence, text },
            remoteStatus: `写入本机失败，请点击复制收到内容：${errorMessage(caught)}`,
          }));
        }
      });
    remoteWriteTailRef.current = task;
  }, []);

  async function handleCopyRemoteClipboard(): Promise<void> {
    const fallback = state.remoteFallback;
    if (!fallback || state.copying) return;
    const generation = generationRef.current;
    const enabledRevision = enabledRevisionRef.current;
    setState((current) => ({ ...current, copying: true }));
    try {
      await writeLocalClipboardText(fallback.text);
      if (!isCurrentOperation(generationRef, enabledRevisionRef, generation, enabledRevision)) return;
      autoReadAllowedRef.current = syncEnabledRef.current;
      setState((current) =>
        current.remoteFallback?.id === fallback.id
          ? {
              ...current,
              copying: false,
              remoteFallback: null,
              remoteStatus: `已复制收到内容（${fallback.text.length} 字符）`,
            }
          : { ...current, copying: false },
      );
      showToast("已复制远端剪贴板内容");
    } catch (caught) {
      if (!isCurrentOperation(generationRef, enabledRevisionRef, generation, enabledRevision)) return;
      setState((current) => ({
        ...current,
        copying: false,
        remoteStatus: `复制失败，请在文本框中手动复制：${errorMessage(caught)}`,
      }));
    }
  }

  const canReadLocalClipboard =
    !state.reading && !readIssue && clipboardChannelsOpenRef.current && browserSessionRef.current !== null;
  const canSendClipboardText =
    state.localText !== null &&
    !state.sending &&
    clipboardChannelsOpenRef.current &&
    browserSessionRef.current !== null;
  const remoteClipboardPendingText = state.remoteFallback?.text ?? null;

  return {
    clipboardSyncEnabled: state.enabled,
    clipboardSyncAvailable,
    clipboardPreviewLabel: clipboardSyncAvailable ? (state.enabled ? "已开启" : "已关闭") : "不可用",
    localClipboardStatusLabel: state.localStatus,
    remoteClipboardStatusLabel: state.remoteStatus,
    remoteClipboardPendingText,
    canReadLocalClipboard,
    canSendClipboardText,
    canCopyRemoteClipboard: state.remoteFallback !== null && !state.copying,
    resetClipboardSession,
    handleClipboardSyncEnabledChange,
    handleReadLocalClipboard,
    handleSendClipboardText,
    handleCopyRemoteClipboard: () => void handleCopyRemoteClipboard(),
    handleRemoteClipboard,
  };
}

function createInitialState(enabled = true): RemoteClipboardUiState {
  return {
    enabled,
    localText: null,
    localStatus: initialLocalStatus(),
    remoteFallback: null,
    remoteStatus: initialRemoteStatus(),
    reading: false,
    sending: false,
    copying: false,
  };
}

function initialLocalStatus(): string {
  return getLocalClipboardAccessIssue("read") ?? "尚未读取本机剪贴板";
}

function initialRemoteStatus(): string {
  return getLocalClipboardAccessIssue("write") ?? "尚未收到远端剪贴板";
}

function isCurrentOperation(
  generationRef: RefObject<number>,
  enabledRevisionRef: RefObject<number>,
  generation: number,
  enabledRevision: number,
): boolean {
  return generationRef.current === generation && enabledRevisionRef.current === enabledRevision;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
