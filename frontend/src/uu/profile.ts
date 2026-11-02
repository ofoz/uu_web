import type { LoginState } from "@uurc/shared/authState";
import type { AndroidDeviceInitProfile } from "@uurc/shared/loginFlow";

export function createSyntheticAndroidProfile(
  state: Partial<LoginState>,
  overrides: Partial<AndroidDeviceInitProfile> = {},
): { state: LoginState; profile: AndroidDeviceInitProfile } {
  const clientId = state.clientId || `uurc-web-${randomId().replaceAll("-", "").slice(0, 16)}`;
  const installId = state.uuid || randomId();
  const systemId = `uurc-web-${browserHostLabel()}-${clientId.slice(-8)}`;
  const profile: AndroidDeviceInitProfile = {
    name: "UU Web Controller",
    client_id: clientId,
    system_id: systemId,
    system_version: "15",
    gaid: "",
    install_id: installId,
    build_fingerprint: "google/shiba/shiba:15/AP3A.240905.015/release-keys",
    brand: "google",
    manufacturer: "Google",
    model: "Pixel 8",
    product: "shiba",
    rom: "Android",
    abi: "arm64-v8a",
    resolution: "1080x2400",
    screen_size: "1080x2400",
    dpi: 420,
    ...overrides,
  };

  return {
    state: {
      token: state.token ?? "",
      userId: state.userId ?? "",
      clientId: profile.client_id,
      deviceId: state.deviceId ?? "",
      oaid: state.oaid ?? "",
      uuid: profile.install_id,
      channel: state.channel ?? "",
    },
    profile,
  };
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function browserHostLabel(): string {
  const host = globalThis.location?.hostname || "browser";
  return host.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40) || "browser";
}
