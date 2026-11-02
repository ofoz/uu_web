import { describe, expect, it } from "vitest";

import { toAndroidKeyCodeFromDomEvent } from "../src/remote/androidKeyCodes.js";

describe("Android source keycode mapping for streamer input", () => {
  it("maps printable DOM codes to Android KeyEvent codes used by the App input transformer", () => {
    expect(toAndroidKeyCodeFromDomEvent({ code: "KeyA", key: "a" })).toBe(29);
    expect(toAndroidKeyCodeFromDomEvent({ code: "KeyZ", key: "z" })).toBe(54);
    expect(toAndroidKeyCodeFromDomEvent({ code: "Digit0", key: "0" })).toBe(7);
    expect(toAndroidKeyCodeFromDomEvent({ code: "Digit9", key: "9" })).toBe(16);
  });

  it("maps navigation and editing keys to Android KeyEvent codes", () => {
    expect(toAndroidKeyCodeFromDomEvent({ code: "Enter", key: "Enter" })).toBe(66);
    expect(toAndroidKeyCodeFromDomEvent({ code: "Backspace", key: "Backspace" })).toBe(67);
    expect(toAndroidKeyCodeFromDomEvent({ code: "ArrowLeft", key: "ArrowLeft" })).toBe(21);
    expect(toAndroidKeyCodeFromDomEvent({ code: "ArrowRight", key: "ArrowRight" })).toBe(22);
    expect(toAndroidKeyCodeFromDomEvent({ code: "Space", key: " " })).toBe(62);
  });

  it("keeps unknown keys as DOM key strings so unsupported keys are still observable", () => {
    expect(toAndroidKeyCodeFromDomEvent({ code: "Unidentified", key: "AudioVolumeUp" })).toBe("AudioVolumeUp");
  });
});
