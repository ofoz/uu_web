import { describe, expect, it } from "vitest";

import { normalizeStreamerRoomConfig, summarizeStreamerRoomConfig } from "../src/roomConfig.js";

describe("room config normalization", () => {
  it("extracts the app-compatible StreamerRoomConfig fields from nested upstream data", () => {
    const config = normalizeStreamerRoomConfig({
      code: 0,
      data: {
        room_info: {
          token: "room-secret-token",
          signal_servers: ["wss://signal-a.example", "wss://signal-b.example"],
          timeout: 12000,
          signal_reconnect_delay: 1500,
          report_token: "report-secret-token",
          report_url: "https://report.example/qos",
          report_server_address: "report.example:443",
          app_data: '{"network":"auto"}',
        },
      },
    });

    expect(config).toEqual({
      token: "room-secret-token",
      signalServers: ["wss://signal-a.example", "wss://signal-b.example"],
      timeout: 12000,
      signalReconnectDelay: 1500,
      reportToken: "report-secret-token",
      reportUrl: "https://report.example/qos",
      reportServerAddress: "report.example:443",
      appData: '{"network":"auto"}',
    });
  });

  it("returns a token-safe summary for the browser UI", () => {
    const summary = summarizeStreamerRoomConfig({
      token: "room-secret-token",
      signalServers: ["wss://signal-a.example"],
      timeout: 12000,
      signalReconnectDelay: 1500,
      reportToken: "report-secret-token",
      reportUrl: "https://report.example/qos",
      reportServerAddress: "report.example:443",
      appData: "{}",
    });

    expect(summary).toEqual({
      tokenPresent: true,
      signalServerCount: 1,
      signalServers: ["wss://signal-a.example"],
      timeout: 12000,
      signalReconnectDelay: 1500,
      reportUrl: "https://report.example/qos",
      reportServerAddress: "report.example:443",
      appDataPresent: true,
    });
  });

  it("extracts the live join-room signaling fields used by the App API", () => {
    const config = normalizeStreamerRoomConfig({
      code: 0,
      data: {
        token: "room-secret-token",
        signaling_server: "wss://primary.signal.example",
        signaling_list: ["wss://primary.signal.example", "wss://backup.signal.example"],
        ws_connect_timeout_ms: 12000,
        max_reconnect_delta: 1500,
        report_token: "report-secret-token",
        report_url: "https://report.example/qos",
        report_server_address: "report.example:443",
        streamer_retry_delta_ms: 900,
        international_connect: false,
      },
    });

    expect(config).toEqual({
      token: "room-secret-token",
      signalServers: ["wss://primary.signal.example", "wss://backup.signal.example"],
      timeout: 12000,
      signalReconnectDelay: 1500,
      reportToken: "report-secret-token",
      reportUrl: "https://report.example/qos",
      reportServerAddress: "report.example:443",
      appData: undefined,
    });
  });

  it("returns null when the response does not contain streamer fields", () => {
    expect(normalizeStreamerRoomConfig({ code: 1001, data: {} })).toBeNull();
  });
});
