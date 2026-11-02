import {
  buildStreamerKeyboardInputMessage,
  buildStreamerMacKeyboardInputMessage,
  buildStreamerMacMouseMoveAbsoluteInputMessage,
  buildStreamerMacMouseScrollInputMessage,
  buildStreamerMouseButtonInputMessage,
  buildStreamerMouseMoveAbsoluteInputMessage,
  buildStreamerMouseScrollInputMessage,
  buildStreamerTextInputMessage,
  buildStreamerWindowsKeyboardInputMessage,
  type StreamerMouseButtonKind,
} from "@uurc/shared/streamer/inputDesktop";
import { STREAMER_MAX_DATA_BUFFER_BYTES } from "@uurc/shared/streamer/transport";
import type {
  BrowserRemoteDataChannel,
  BrowserRemoteKeyboardInput,
  BrowserRemoteMouseButtonInput,
  BrowserRemoteMouseClickInput,
  BrowserRemoteMouseMoveOptions,
  BrowserRemoteMousePositionInput,
  BrowserRemoteMouseScrollInput,
} from "../browserRemoteSessionTypes.js";
import { getErrorMessage, isDesktopPlatform, isMacPlatform, isWindowsPlatform } from "./utils.js";

export const MOUSE_MOVE_BUFFERED_AMOUNT_LOW_THRESHOLD = Math.floor(STREAMER_MAX_DATA_BUFFER_BYTES / 4);

interface BrowserRemoteInputOptions {
  getControlChannel(): BrowserRemoteDataChannel | undefined;
  getTargetPlatform(): number | undefined;
  now(): number;
  recordDebugEvent(summary: string, details?: Record<string, unknown>): void;
  sendInputData(inputMessage: string, options?: { recordDebugEvent?: boolean }): void;
}

export class BrowserRemoteInput {
  private lastBackpressureDebugAtMs = 0;
  private pendingMouseMove: BrowserRemoteMousePositionInput | undefined;
  private pendingCriticalMouseMove: BrowserRemoteMousePositionInput | undefined;
  private readonly heldKeyboardValues = new Set<string | number>();
  private readonly heldMouseButtons = new Set<StreamerMouseButtonKind | number>();

  constructor(private readonly options: BrowserRemoteInputOptions) {}

  reset(): void {
    this.pendingMouseMove = undefined;
    this.pendingCriticalMouseMove = undefined;
    this.heldKeyboardValues.clear();
    this.heldMouseButtons.clear();
    this.lastBackpressureDebugAtMs = 0;
  }

  clearPendingPointerMoves(): void {
    this.pendingMouseMove = undefined;
    this.pendingCriticalMouseMove = undefined;
  }

  sendMouseClick(input: BrowserRemoteMouseClickInput): void {
    const button = input.button ?? "primary";
    this.sendMouseMove(input, { critical: true });
    this.sendMouseButton({ action: "mousePress", button });
    this.sendMouseButton({ action: "mouseRelease", button });
  }

  sendMouseMove(input: BrowserRemoteMousePositionInput, options: BrowserRemoteMouseMoveOptions = {}): void {
    const channel = this.options.getControlChannel();
    const bufferedAmount = channel?.bufferedAmount ?? 0;
    if (options.critical) {
      this.pendingMouseMove = undefined;
      this.pendingCriticalMouseMove = { ...input };
      this.flushPendingCriticalMouseMove();
      return;
    }
    if (this.pendingCriticalMouseMove) {
      this.pendingMouseMove = { ...input };
      this.flushPendingMouseMove();
      return;
    }
    if (bufferedAmount >= STREAMER_MAX_DATA_BUFFER_BYTES) {
      this.pendingMouseMove = { ...input };
      const nowMs = this.options.now();
      if (this.lastBackpressureDebugAtMs === 0 || nowMs - this.lastBackpressureDebugAtMs >= 5000) {
        this.lastBackpressureDebugAtMs = nowMs;
        this.options.recordDebugEvent("控制通道拥塞，跳过鼠标移动", {
          bufferedAmount,
          threshold: STREAMER_MAX_DATA_BUFFER_BYTES,
        });
      }
      return;
    }
    this.pendingMouseMove = undefined;
    this.options.sendInputData(this.buildMouseMoveAbsoluteInput(input), { recordDebugEvent: false });
  }

  sendMouseButton(input: BrowserRemoteMouseButtonInput): void {
    this.pendingMouseMove = undefined;
    this.flushPendingCriticalMouseMove();
    const button = input.button ?? "primary";
    this.options.sendInputData(buildStreamerMouseButtonInputMessage({ action: input.action, button }));
    if (input.action === "mousePress") this.heldMouseButtons.add(button);
    else if (input.action === "mouseRelease") this.heldMouseButtons.delete(button);
  }

  sendMouseScroll(input: BrowserRemoteMouseScrollInput): void {
    this.pendingMouseMove = undefined;
    this.flushPendingCriticalMouseMove();
    this.options.sendInputData(
      isDesktopPlatform(this.options.getTargetPlatform())
        ? buildStreamerMacMouseScrollInputMessage(input)
        : buildStreamerMouseScrollInputMessage(input),
    );
  }

  sendKeyboardInput(input: BrowserRemoteKeyboardInput): void {
    const inputMessage = this.buildKeyboardInput(input);
    this.options.sendInputData(inputMessage);
    if (!inputMessage) return;
    if (input.action === "keyboardPress") this.heldKeyboardValues.add(input.value);
    else if (input.action === "keyboardRelease") this.heldKeyboardValues.delete(input.value);
  }

  sendTextInput(content: string): void {
    if (!content) return;
    this.options.sendInputData(buildStreamerTextInputMessage(content));
  }

  releaseAll(): void {
    const buttons = [...this.heldMouseButtons];
    const keys = [...this.heldKeyboardValues];
    this.clearPendingPointerMoves();
    for (const button of buttons) {
      try {
        this.options.sendInputData(buildStreamerMouseButtonInputMessage({ action: "mouseRelease", button }));
        this.heldMouseButtons.delete(button);
      } catch {
        // The channel may be temporarily unavailable; retain the held state for a later retry.
      }
    }
    for (const value of keys) {
      try {
        this.options.sendInputData(this.buildKeyboardInput({ action: "keyboardRelease", value }));
        this.heldKeyboardValues.delete(value);
      } catch {
        // The channel may be temporarily unavailable; retain the held state for a later retry.
      }
    }
  }

  flushPendingMouseMove(): void {
    const channel = this.options.getControlChannel();
    if (
      !channel ||
      channel.readyState !== "open" ||
      (channel.bufferedAmount ?? 0) > MOUSE_MOVE_BUFFERED_AMOUNT_LOW_THRESHOLD
    ) {
      return;
    }
    if (this.pendingCriticalMouseMove) {
      try {
        this.flushPendingCriticalMouseMove();
      } catch (error) {
        this.options.recordDebugEvent("补发关键鼠标位置失败", {
          bufferedAmount: channel.bufferedAmount,
          error: getErrorMessage(error),
        });
        return;
      }
    }
    const pending = this.pendingMouseMove;
    if (!pending || (channel.bufferedAmount ?? 0) > MOUSE_MOVE_BUFFERED_AMOUNT_LOW_THRESHOLD) return;
    this.pendingMouseMove = undefined;
    try {
      this.sendMouseMove(pending);
    } catch (error) {
      if (channel.readyState === "open") this.pendingMouseMove = pending;
      this.options.recordDebugEvent("补发鼠标移动失败", {
        bufferedAmount: channel.bufferedAmount,
        error: getErrorMessage(error),
      });
    }
  }

  private flushPendingCriticalMouseMove(): void {
    const pending = this.pendingCriticalMouseMove;
    if (!pending) return;
    this.options.sendInputData(this.buildMouseMoveAbsoluteInput(pending), { recordDebugEvent: false });
    if (this.pendingCriticalMouseMove === pending) this.pendingCriticalMouseMove = undefined;
  }

  private buildMouseMoveAbsoluteInput(input: BrowserRemoteMousePositionInput): string {
    if (isDesktopPlatform(this.options.getTargetPlatform())) {
      return buildStreamerMacMouseMoveAbsoluteInputMessage({
        ...input,
        surfaceWidth: input.surfaceWidth ?? Math.max(1, Math.round(input.absX)),
        surfaceHeight: input.surfaceHeight ?? Math.max(1, Math.round(input.absY)),
      });
    }
    return buildStreamerMouseMoveAbsoluteInputMessage(input);
  }

  private buildKeyboardInput(input: BrowserRemoteKeyboardInput): string {
    const platform = this.options.getTargetPlatform();
    if (isMacPlatform(platform)) return buildStreamerMacKeyboardInputMessage(input);
    if (isWindowsPlatform(platform)) return buildStreamerWindowsKeyboardInputMessage(input);
    return buildStreamerKeyboardInputMessage(input);
  }
}
