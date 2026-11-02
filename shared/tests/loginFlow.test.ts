import { describe, expect, it } from "vitest";

import {
  buildAndroidDeviceInitRequest,
  buildMobileCodeRequest,
  buildMobileLoginRequest,
  normalizeDeviceInitResult,
  normalizeMobileLoginResult,
  type AndroidDeviceInitProfile,
} from "../src/loginFlow.js";

describe("UU app-aligned login flow requests", () => {
  it("builds the SMS code request body used by the Android app", () => {
    expect(buildMobileCodeRequest({ regionCode: "86", mobile: "13800000000" })).toEqual({
      method: "POST",
      path: "/api/v1/security/mobile/code",
      body: {
        country_code: "86",
        mobile: "13800000000",
        type: "login",
      },
    });
  });

  it("builds the mobile login request body used by the Android app", () => {
    expect(buildMobileLoginRequest({ regionCode: "86", mobile: "13800000000", code: "123456" })).toEqual({
      method: "POST",
      path: "/api/v1/login/by_mobile",
      body: {
        country_code: "86",
        mobile: "13800000000",
        code: "123456",
      },
    });
  });

  it("builds the Android device init payload with app field names", () => {
    const profile: AndroidDeviceInitProfile = {
      name: "Pixel 8",
      client_id: "client-1",
      system_id: "system-1",
      system_version: "15",
      gaid: "",
      install_id: "install-1",
      build_fingerprint: "google/shiba/shiba:15/release-keys",
      brand: "google",
      manufacturer: "Google",
      model: "Pixel 8",
      product: "shiba",
      rom: "Android",
      abi: "arm64-v8a",
      resolution: "1080x2400",
      screen_size: "1080x2400",
      dpi: 420,
    };

    expect(buildAndroidDeviceInitRequest(profile)).toEqual({
      method: "POST",
      path: "/api/v1/device/android/init",
      body: profile,
    });
  });

  it("normalizes wrapped login and device-init responses", () => {
    expect(
      normalizeMobileLoginResult({
        code: 0,
        data: {
          user_id: "user-1",
          nickname: "me",
          token: "token-1",
        },
      }),
    ).toEqual({
      userId: "user-1",
      nickName: "me",
      token: "token-1",
    });

    expect(normalizeDeviceInitResult({ code: 0, data: { device_id: "device-1" } })).toBe("device-1");
  });
});
