import { describe, expect, it } from "vitest";

import { sendRemoteShortcut } from "../src/remote/remoteShortcuts.js";

describe("remote shortcut sender", () => {
  it("sends Windows Ctrl Alt Del as held modifiers and a released terminal key", () => {
    const sent: Array<{ action: string; value: string | number }> = [];

    sendRemoteShortcut({ sendKeyboardInput: (input) => sent.push(input) }, "windows-ctrl-alt-del");

    expect(sent).toEqual([
      { action: "keyboardPress", value: 113 },
      { action: "keyboardPress", value: 57 },
      { action: "keyboardPress", value: 112 },
      { action: "keyboardRelease", value: 112 },
      { action: "keyboardRelease", value: 57 },
      { action: "keyboardRelease", value: 113 },
    ]);
  });

  it("sends Mac Cmd Opt Esc without relying on browser keyboard capture", () => {
    const sent: Array<{ action: string; value: string | number }> = [];

    sendRemoteShortcut({ sendKeyboardInput: (input) => sent.push(input) }, "mac-force-quit");

    expect(sent).toEqual([
      { action: "keyboardPress", value: 117 },
      { action: "keyboardPress", value: 57 },
      { action: "keyboardPress", value: 111 },
      { action: "keyboardRelease", value: 111 },
      { action: "keyboardRelease", value: 57 },
      { action: "keyboardRelease", value: 117 },
    ]);
  });
});
