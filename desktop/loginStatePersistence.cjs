const fs = require("node:fs");
const path = require("node:path");

const LOGIN_STATE_FIELDS = ["token", "userId", "clientId", "deviceId", "oaid", "uuid", "channel"];

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeDesktopLoginState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const candidate = {
    token: nonEmptyString(input.token),
    userId: nonEmptyString(input.userId ?? input.user_id),
    clientId: nonEmptyString(input.clientId ?? input.client_id),
    deviceId: nonEmptyString(input.deviceId ?? input.device_id),
    oaid: nonEmptyString(input.oaid),
    uuid: nonEmptyString(input.uuid),
    channel: nonEmptyString(input.channel),
  };

  const normalized = {};
  for (const field of LOGIN_STATE_FIELDS) {
    if (candidate[field] !== undefined) {
      normalized[field] = candidate[field];
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function hasCompleteLoginState(state) {
  return Boolean(state && state.token && state.userId && state.deviceId);
}

function resolveInitialUrl(appUrl, savedState) {
  try {
    const url = new URL(appUrl);
    if (url.pathname === "/" && hasCompleteLoginState(savedState)) {
      url.pathname = "/devices";
    }
    return url.toString();
  } catch {
    return appUrl;
  }
}

function canUseSafeStorage(safeStorage) {
  return Boolean(
    safeStorage &&
    typeof safeStorage.isEncryptionAvailable === "function" &&
    safeStorage.isEncryptionAvailable() &&
    typeof safeStorage.encryptString === "function" &&
    typeof safeStorage.decryptString === "function",
  );
}

function createDesktopLoginStateStore({ filePath, safeStorage = null }) {
  function load() {
    let raw;
    try {
      raw = fs.readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
    if (!raw) return null;

    try {
      const envelope = JSON.parse(raw);
      if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
        return null;
      }

      if (envelope.encrypted === true) {
        if (!canUseSafeStorage(safeStorage) || typeof envelope.payload !== "string") {
          return null;
        }
        const decrypted = safeStorage.decryptString(Buffer.from(envelope.payload, "base64"));
        return normalizeDesktopLoginState(JSON.parse(decrypted));
      }

      if (typeof envelope.payload === "string") {
        return normalizeDesktopLoginState(JSON.parse(envelope.payload));
      }

      return normalizeDesktopLoginState(envelope);
    } catch {
      return null;
    }
  }

  function clear() {
    fs.rmSync(filePath, { force: true });
    return true;
  }

  function save(input) {
    const normalized = normalizeDesktopLoginState(input);
    if (!normalized) {
      clear();
      return null;
    }

    const serialized = JSON.stringify(normalized);
    let envelope = { version: 1, encrypted: false, payload: serialized };
    if (canUseSafeStorage(safeStorage)) {
      try {
        const encryptedPayload = safeStorage.encryptString(serialized).toString("base64");
        envelope = { version: 1, encrypted: true, payload: encryptedPayload };
      } catch {
        // 部分 Linux 桌面环境虽声明支持加密但密钥环未解锁，回退到受权限保护的本地文件存储。
      }
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(envelope), { encoding: "utf8", mode: 0o600 });
      fs.renameSync(tmpPath, filePath);
    } catch (error) {
      fs.rmSync(tmpPath, { force: true });
      throw error;
    }

    return normalized;
  }

  return {
    load,
    save,
    clear,
  };
}

module.exports = {
  LOGIN_STATE_FIELDS,
  createDesktopLoginStateStore,
  hasCompleteLoginState,
  normalizeDesktopLoginState,
  resolveInitialUrl,
};
