import { gzipSync, gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  buildSignalGatewayControlPayload,
  buildSignalGatewaySoacPayload,
  normalizeSignalGatewayPayload,
  type SignalGatewayBinaryCodec,
} from "../src/signalGateway/payload.js";
import { normalizeSignalGatewayInboundEvents } from "../src/signalGateway/events.js";
import { createSignalGatewayStatus, orderSignalGatewayServers } from "../src/signalGateway/status.js";
import type { StreamerRoomConfig } from "../src/roomConfig.js";

const binaryCodec: SignalGatewayBinaryCodec<Buffer> = {
  decodeBase64: (value) => Buffer.from(value ?? "", "base64"),
  toBinary: (value) => {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return record.kind === "binary" && typeof record.base64 === "string" ? Buffer.from(record.base64, "base64") : null;
  },
  byteLength: (value) => value.byteLength,
  encodeBase64: (value) => value.toString("base64"),
  gzipText: (value) => gzipSync(Buffer.from(value, "utf8"), { level: 6 }),
  gunzipText: (value) => {
    const buffer = binaryCodec.toBinary(value);
    if (!buffer) return null;
    try {
      return gunzipSync(buffer).toString("utf8");
    } catch {
      return null;
    }
  },
};

describe("signal gateway protocol helpers", () => {
  it("orders signal servers and builds token-safe status", () => {
    const roomConfig: StreamerRoomConfig = {
      token: "room-token",
      signalServers: ["wss://a.example", "wss://b.example", "wss://c.example"],
    };

    expect(orderSignalGatewayServers(roomConfig.signalServers, 1)).toEqual([
      "wss://b.example",
      "wss://a.example",
      "wss://c.example",
    ]);
    expect(
      createSignalGatewayStatus({
        status: "connected",
        roomConfig,
        rawHeaders: { "X-NRD-AUTH": "room-token" },
        selectedSignalServer: "wss://b.example",
        startedAt: "2026-05-18T00:00:00.000Z",
        updatedAt: "2026-05-18T00:00:01.000Z",
      }),
    ).toMatchObject({
      status: "connected",
      selectedSignalServer: "wss://b.example",
      signalHeaders: { "X-NRD-AUTH": "<redacted room token>" },
      signalControl: {
        event: "control",
        ackTimeoutMs: 10000,
      },
      updatedAt: "2026-05-18T00:00:01.000Z",
    });
  });

  it("builds and normalizes binary control and SOAC payloads", () => {
    const control = buildSignalGatewayControlPayload(
      {
        appControlId: "control-1",
        appDataBase64: Buffer.from("app-data").toString("base64"),
        streamerData: "{}",
      },
      binaryCodec,
    );

    expect(Buffer.from(control.app_data as Buffer).toString()).toBe("app-data");
    expect(normalizeSignalGatewayPayload(control, binaryCodec)).toMatchObject({
      app_control_id: "control-1",
      app_data: {
        kind: "binary",
        byteLength: 8,
        base64: Buffer.from("app-data").toString("base64"),
      },
    });

    const soac = buildSignalGatewaySoacPayload(
      {
        type: "offer",
        clientId: "controlled-1",
        appControlId: "control-1",
        iceId: "ice-1",
        sdp: "v=0",
        gzipSdp: true,
      },
      binaryCodec,
    );

    const data = soac.data as Record<string, unknown>;
    expect(data.sdp).toBe("");
    expect(gunzipSync(data.gzip_sdp as Buffer).toString("utf8")).toBe("v=0");
  });

  it("normalizes pushed and direct SOAC events including gzip SDP", () => {
    const pushed = normalizeSignalGatewayInboundEvents(
      "bmsg_push",
      [
        {
          type: "answer",
          data: {
            client_id: "controlled-1",
            data: {
              ice_id: "ice-1",
              sdp: "",
              gzip_sdp: gzipSync(Buffer.from("v=0 answer", "utf8")),
            },
          },
        },
      ],
      binaryCodec,
    );

    expect(pushed).toMatchObject([
      { event: "bmsg_push" },
      {
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: {
              type: "answer",
              ice_id: "ice-1",
              sdp: "v=0 answer",
            },
          },
        ],
      },
    ]);

    expect(
      normalizeSignalGatewayInboundEvents(
        "answer",
        [
          {
            client_id: "controlled-1",
            data: {
              ice_id: "ice-1",
              sdp: "v=0 direct answer",
            },
          },
        ],
        binaryCodec,
      ),
    ).toMatchObject([
      {
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: {
              type: "answer",
              ice_id: "ice-1",
              sdp: "v=0 direct answer",
            },
          },
        ],
      },
    ]);
  });
});
