import { STREAMER_ANDROID_TO_MAC_KEY_CODES, STREAMER_ANDROID_TO_WINDOWS_KEY_CODES } from "./internal/keyCodes.js";

const STREAMER_DESKTOP_INPUT_EVENT_TYPES = {
  mousePress: "mouse_press",
  mouseRelease: "mouse_release",
  mouseClick: "mouse_click",
  mouseMoveAbsolute: "mouse_move_absolute",
  mouseScroll: "mouse_scroll",
  keyboardPress: "kbd_press",
  keyboardRelease: "kbd_release",
  keyboardClick: "kbd_click",
} as const;

const STREAMER_MOUSE_BUTTON_CODES = {
  primary: 1,
  secondary: 2,
  tertiary: 4,
  back: 8,
  forward: 16,
} as const;

export type StreamerMouseButtonKind = keyof typeof STREAMER_MOUSE_BUTTON_CODES;

interface MouseButtonInput {
  action: "mousePress" | "mouseRelease" | "mouseClick";
  button: StreamerMouseButtonKind | number;
}

interface MouseMoveInput {
  absX: number;
  absY: number;
}

interface MacMouseMoveInput extends MouseMoveInput {
  surfaceWidth: number;
  surfaceHeight: number;
}

interface MouseScrollInput {
  deltaX: number;
  deltaY: number;
}

interface KeyboardInput {
  action: "keyboardPress" | "keyboardRelease" | "keyboardClick";
  value: string | number;
}

export function buildStreamerMouseButtonInputMessage(input: MouseButtonInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES[input.action],
    button: typeof input.button === "number" ? input.button : STREAMER_MOUSE_BUTTON_CODES[input.button],
  });
}

export function buildStreamerMouseMoveAbsoluteInputMessage(input: MouseMoveInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES.mouseMoveAbsolute,
    abs_x: Math.round(input.absX),
    abs_y: Math.round(input.absY),
  });
}

export function buildStreamerMacMouseMoveAbsoluteInputMessage(input: MacMouseMoveInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES.mouseMoveAbsolute,
    abs_x: normalizeAbsolutePointerAxis(input.absX, input.surfaceWidth),
    abs_y: normalizeAbsolutePointerAxis(input.absY, input.surfaceHeight),
  });
}

export function buildStreamerMouseScrollInputMessage(input: MouseScrollInput): string {
  return buildScrollInputMessage(input);
}

export function buildStreamerMacMouseScrollInputMessage(input: MouseScrollInput): string {
  return buildScrollInputMessage(input);
}

export function buildStreamerKeyboardInputMessage(input: KeyboardInput): string {
  return JSON.stringify({ action: STREAMER_DESKTOP_INPUT_EVENT_TYPES[input.action], key: input.value });
}

export function buildStreamerMacKeyboardInputMessage(input: KeyboardInput): string {
  return buildMappedKeyboardInput(input, STREAMER_ANDROID_TO_MAC_KEY_CODES, false);
}

export function buildStreamerWindowsKeyboardInputMessage(input: KeyboardInput): string {
  return buildMappedKeyboardInput(input, STREAMER_ANDROID_TO_WINDOWS_KEY_CODES, true);
}

export function buildStreamerTextInputMessage(content: string): string {
  return JSON.stringify({ action: "text_input", content });
}

function buildScrollInputMessage(input: MouseScrollInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES.mouseScroll,
    delta_x: Math.round(input.deltaX),
    delta_y: Math.round(input.deltaY),
  });
}

function buildMappedKeyboardInput(
  input: KeyboardInput,
  keyMap: Readonly<Record<number, number>>,
  interrupt: boolean,
): string {
  if (typeof input.value !== "number" || !Number.isFinite(input.value)) return "";
  const key = keyMap[Math.trunc(input.value)];
  if (key === undefined) return "";
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES[input.action],
    key,
    ...(interrupt ? { interrept: true } : {}),
  });
}

function normalizeAbsolutePointerAxis(value: number, size: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) return 0;
  return Math.min(1, Math.max(0, value / size));
}
