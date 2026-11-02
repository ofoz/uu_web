import { describe, expect, it } from "vitest";

import {
  buildStreamerKeyboardInputMessage,
  buildStreamerMacKeyboardInputMessage,
  buildStreamerMacMouseMoveAbsoluteInputMessage,
  buildStreamerMacMouseScrollInputMessage,
  buildStreamerWindowsKeyboardInputMessage,
  buildStreamerTextInputMessage,
  buildStreamerMouseButtonInputMessage,
  buildStreamerMouseMoveAbsoluteInputMessage,
  buildStreamerMouseScrollInputMessage,
} from "../src/streamer/inputDesktop.js";
import {
  STREAMER_INPUT_MANAGER_IME_CONTROL_CODES,
  STREAMER_INPUT_MANAGER_TOUCH_SLOTS,
  STREAMER_MUMU_SYSTEM_KEY_CODES,
  buildStreamerImeControlInputMessage,
  buildStreamerImeTextInputMessage,
  buildStreamerSystemKeyInputMessages,
  createStreamerTouchInputTracker,
} from "../src/streamer/internal/inputLegacy.js";

describe("streamer input", () => {
  it("builds recovered InputManagerStub IME and system-key input messages", () => {
    expect(buildStreamerImeTextInputMessage("你好")).toBe("TEXT:你好");
    expect(STREAMER_INPUT_MANAGER_IME_CONTROL_CODES).toEqual({
      BACKSPACE: 14,
      ENTER: 28,
      HIDESELF: 100001,
    });
    expect(buildStreamerImeControlInputMessage("ENTER")).toBe("TEXT_CONTROL:ENTER");

    expect(STREAMER_MUMU_SYSTEM_KEY_CODES).toEqual({
      BACK: 158,
      HOME: 172,
      MENU: 580,
    });
    expect(buildStreamerSystemKeyInputMessages({ displayId: 7, key: "BACK" })).toEqual([
      "7:KBDPR:158:1\n",
      "7:KBDRL:158:0\n",
    ]);
  });

  it("builds recovered desktop InputManager JSON input messages", () => {
    expect(buildStreamerMouseButtonInputMessage({ action: "mousePress", button: "primary" })).toBe(
      '{"action":"mouse_press","button":1}',
    );
    expect(
      (["primary", "secondary", "tertiary", "back", "forward"] as const).map((button) =>
        buildStreamerMouseButtonInputMessage({ action: "mouseClick", button }),
      ),
    ).toEqual([
      '{"action":"mouse_click","button":1}',
      '{"action":"mouse_click","button":2}',
      '{"action":"mouse_click","button":4}',
      '{"action":"mouse_click","button":8}',
      '{"action":"mouse_click","button":16}',
    ]);
    expect(buildStreamerMouseButtonInputMessage({ action: "mouseRelease", button: "primary" })).toBe(
      '{"action":"mouse_release","button":1}',
    );
    expect(buildStreamerMouseMoveAbsoluteInputMessage({ absX: 320, absY: 240 })).toBe(
      '{"action":"mouse_move_absolute","abs_x":320,"abs_y":240}',
    );
    expect(buildStreamerMouseScrollInputMessage({ deltaX: 0, deltaY: -120 })).toBe(
      '{"action":"mouse_scroll","delta_x":0,"delta_y":-120}',
    );
    expect(buildStreamerKeyboardInputMessage({ action: "keyboardClick", value: "A" })).toBe(
      '{"action":"kbd_click","key":"A"}',
    );
    expect(buildStreamerKeyboardInputMessage({ action: "keyboardPress", value: "A" })).toBe(
      '{"action":"kbd_press","key":"A"}',
    );
    expect(buildStreamerKeyboardInputMessage({ action: "keyboardRelease", value: "A" })).toBe(
      '{"action":"kbd_release","key":"A"}',
    );
  });

  it("builds verified Android-to-Mac InputManager output messages", () => {
    expect(
      buildStreamerMacMouseMoveAbsoluteInputMessage({
        absX: 384,
        absY: 1037,
        surfaceWidth: 1920,
        surfaceHeight: 1080,
      }),
    ).toBe('{"action":"mouse_move_absolute","abs_x":0.2,"abs_y":0.9601851851851851}');
    expect(buildStreamerMacMouseScrollInputMessage({ deltaX: 0, deltaY: -120 })).toBe(
      '{"action":"mouse_scroll","delta_x":0,"delta_y":-120}',
    );
    expect(buildStreamerMacKeyboardInputMessage({ action: "keyboardPress", value: 59 })).toBe(
      '{"action":"kbd_press","key":56}',
    );
    expect(buildStreamerMacKeyboardInputMessage({ action: "keyboardRelease", value: 29 })).toBe(
      '{"action":"kbd_release","key":0}',
    );
    expect(buildStreamerMacKeyboardInputMessage({ action: "keyboardPress", value: "A" })).toBe("");
  });

  it("builds verified Android-to-Windows keyboard output messages (VK codes + interrept)", () => {
    // 与真机抓包一致:key 为 Windows VK，且带 interrept 字段。
    // ControlLeft(android 113)→ VK_LCONTROL 162;A(29)→ 65;Backspace(67)→ VK_BACK 8;MetaLeft(117)→ VK_LWIN 91。
    expect(buildStreamerWindowsKeyboardInputMessage({ action: "keyboardPress", value: 113 })).toBe(
      '{"action":"kbd_press","key":162,"interrept":true}',
    );
    expect(buildStreamerWindowsKeyboardInputMessage({ action: "keyboardPress", value: 29 })).toBe(
      '{"action":"kbd_press","key":65,"interrept":true}',
    );
    expect(buildStreamerWindowsKeyboardInputMessage({ action: "keyboardRelease", value: 67 })).toBe(
      '{"action":"kbd_release","key":8,"interrept":true}',
    );
    expect(buildStreamerWindowsKeyboardInputMessage({ action: "keyboardPress", value: 117 })).toBe(
      '{"action":"kbd_press","key":91,"interrept":true}',
    );
    // 未命中(非数字/未映射)返回空串，由发送层静默跳过。
    expect(buildStreamerWindowsKeyboardInputMessage({ action: "keyboardPress", value: "A" })).toBe("");
  });

  it("builds desktop text_input messages for typed characters", () => {
    expect(buildStreamerTextInputMessage("o")).toBe('{"action":"text_input","content":"o"}');
    expect(buildStreamerTextInputMessage("ABC ")).toBe('{"action":"text_input","content":"ABC "}');
    expect(buildStreamerTextInputMessage("你看")).toBe('{"action":"text_input","content":"你看"}');
  });

  it("builds recovered MuMu touch input messages with stable control slots", () => {
    expect(STREAMER_INPUT_MANAGER_TOUCH_SLOTS).toEqual([26, 27, 28, 29, 30, 31]);

    const tracker = createStreamerTouchInputTracker({
      displayId: 7,
      width: 1920,
      height: 1080,
      rotation: 0,
    });

    expect(tracker.start()).toEqual(["7:SLOTMULTIRELEASE:26:27:28:29:30:31\n"]);
    expect(tracker.update([{ id: 10, relX: 0.25, relY: 0.5 }])).toEqual(["7:SLOTMULTIPRESS:26:26:480:540\n"]);
    expect(
      tracker.update([
        { id: 10, relX: 0.3, relY: 0.6 },
        { id: 20, relX: 0.75, relY: 0.25 },
      ]),
    ).toEqual(["7:SLOTMULTIPRESS:26:26:576:648:27:27:1440:270\n"]);
    expect(tracker.update([{ id: 20, relX: 1, relY: 1 }])).toEqual([
      "7:SLOTMULTIRELEASE:26\n",
      "7:SLOTMULTIPRESS:27:27:1920:1080\n",
    ]);
    expect(tracker.end()).toEqual(["7:SLOTMULTIRELEASE:26:27:28:29:30:31\n"]);
  });

  it("matches MuMu touch rotation handling for 90 and 270 degrees", () => {
    expect(
      createStreamerTouchInputTracker({
        displayId: 1,
        width: 1000,
        height: 500,
        rotation: 90,
      }).update([{ id: 1, relX: 0.2, relY: 0.3 }]),
    ).toEqual(["1:SLOTMULTIPRESS:26:26:700:100\n"]);

    expect(
      createStreamerTouchInputTracker({
        displayId: 1,
        width: 1000,
        height: 500,
        rotation: 270,
      }).update([{ id: 1, relX: 0.2, relY: 0.3 }]),
    ).toEqual(["1:SLOTMULTIPRESS:26:26:300:400\n"]);
  });
});
