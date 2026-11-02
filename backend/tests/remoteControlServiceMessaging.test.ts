import { gunzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";
import { STREAMER_ICE_NETWORK_TYPES } from "@uurc/shared/streamer/signalSoac";

import { RemoteControlService } from "../src/services/remoteControlService.js";
import { FakeSignalGatewayConnector, createRoomConfigSource, roomConfigFor } from "./fixtures/signalGateway.js";

describe("RemoteControlService outbound messages", () => {
  it("emits the App control event with binary app_data and string streamer_data and returns the ack", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    const streamerData = '{"control_id":"control-1","device_capability":{}}';
    const result = await service.sendSignalControl({
      appControlId: "control-1",
      appDataBase64: Buffer.from("app-data").toString("base64"),
      streamerData,
    });

    expect(connector.connections[0].emitWithAckCalls).toHaveLength(1);
    expect(connector.connections[0].emitWithAckCalls[0].event).toBe("control");
    expect(connector.connections[0].emitWithAckCalls[0].ackTimeoutMs).toBe(10000);
    expect(connector.connections[0].emitWithAckCalls[0].payload.app_control_id).toBe("control-1");
    expect(Buffer.isBuffer(connector.connections[0].emitWithAckCalls[0].payload.app_data)).toBe(true);
    expect(Buffer.from(connector.connections[0].emitWithAckCalls[0].payload.app_data).toString()).toBe("app-data");
    expect(connector.connections[0].emitWithAckCalls[0].payload.streamer_data).toBe(streamerData);
    expect(result).toMatchObject({
      event: "control",
      ackStatus: "success",
      ack: [
        "success",
        {
          code: 0,
          msg: "ok",
          app_data: {
            kind: "binary",
            byteLength: 3,
            base64: "AQID",
          },
        },
      ],
      control: {
        ackStatus: "success",
        result: {
          code: 0,
          msg: "ok",
          appDataBase64: "AQID",
          iceServers: [
            {
              urls: "turn:relay.example:3478?transport=udp",
              username: "turn-user",
              credential: "turn-pass",
            },
          ],
        },
      },
    });
  });

  it("emits App-shaped SOAC messages with the ack callback", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    const result = await service.sendSignalSoac({
      type: "offer",
      clientId: "controlled-1",
      appControlId: "control-1",
      iceId: "ice-1",
      sdp: "v=0",
      gzipSdp: true,
      iceNetworkType: STREAMER_ICE_NETWORK_TYPES.appAuto,
    } as Parameters<RemoteControlService["sendSignalSoac"]>[0] & { iceId: string });

    const connection = connector.connections[0] as unknown as {
      emitCalls: unknown[];
      emitWithOptionalAckCalls: Array<{
        event: string;
        payload: Record<string, unknown>;
        onAck: (ack: unknown[]) => void;
      }>;
    };
    expect(connection.emitCalls).toEqual([]);
    expect(connection.emitWithOptionalAckCalls).toHaveLength(1);
    expect(connection.emitWithOptionalAckCalls[0]).toMatchObject({
      event: "soac",
      payload: {
        client_id: "controlled-1",
        data: {
          type: "offer",
          app_control_id: "control-1",
          ice_id: "ice-1",
          sdp: "",
          gzip_sdp: expect.any(Buffer),
          ice_network_type: 3,
        },
      },
    });
    connection.emitWithOptionalAckCalls[0].onAck(["success", { code: 0 }]);
    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        direction: "outbound",
        event: "soac",
      },
      {
        direction: "inbound",
        event: "soac:ack",
        payload: ["success", { code: 0 }],
      },
    ]);
    const sentGzipSdp = connection.emitWithOptionalAckCalls[0].payload.data.gzip_sdp;
    expect(Buffer.isBuffer(sentGzipSdp)).toBe(true);
    expect(gunzipSync(sentGzipSdp as Buffer).toString("utf8")).toBe("v=0");
    expect(result).toMatchObject({
      event: "soac",
      payload: {
        client_id: "controlled-1",
        data: {
          type: "offer",
          ice_id: "ice-1",
          sdp: "",
          gzip_sdp: {
            kind: "binary",
            byteLength: expect.any(Number),
            base64: expect.any(String),
          },
        },
      },
    });
  });

  it("drops a control acknowledgement from a superseded connection", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(undefined, connector);
    await service.startSignalGateway({ roomConfig: roomConfigFor("wss://signal-a.example") });
    const ack = deferred<unknown[]>();
    connector.connections[0].emitWithAck = vi.fn(async () => ack.promise);

    const pendingControl = service.sendSignalControl({ appControlId: "control-1" });
    await vi.waitFor(() => expect(connector.connections[0].emitWithAck).toHaveBeenCalledOnce());
    await service.startSignalGateway({ roomConfig: roomConfigFor("wss://signal-b.example") });
    ack.resolve(["success", { code: 0 }]);

    await expect(pendingControl).resolves.toBeNull();
    expect(service.getSignalGatewayEvents().map((event) => event.event)).not.toContain("control:ack");
  });

  it("drops an optional SOAC acknowledgement from a superseded connection", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(undefined, connector);
    await service.startSignalGateway({ roomConfig: roomConfigFor("wss://signal-a.example") });
    await service.sendSignalSoac({
      type: "candidate",
      clientId: "controlled-1",
      appControlId: "control-1",
      candidate: { candidate: "candidate:1 1 udp 1 192.0.2.1 10000 typ host" },
    });
    const staleAck = connector.connections[0].emitWithOptionalAckCalls[0].onAck;

    await service.startSignalGateway({ roomConfig: roomConfigFor("wss://signal-b.example") });
    staleAck(["success", { code: 0 }]);

    expect(service.getSignalGatewayEvents().map((event) => event.event)).not.toContain("soac:ack");
  });

  it("emits wire-shaped candidate SOAC messages without ice_network_type", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    await service.sendSignalSoac({
      type: "candidate",
      clientId: "controlled-1",
      appControlId: "control-1",
      iceId: "ice-1",
      iceNetworkType: STREAMER_ICE_NETWORK_TYPES.appAuto,
      candidate: {
        candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
    } as Parameters<RemoteControlService["sendSignalSoac"]>[0] & { iceId: string });

    expect(connector.connections[0].emitWithOptionalAckCalls).toMatchObject([
      {
        event: "soac",
        payload: {
          client_id: "controlled-1",
          data: {
            type: "candidate",
            app_control_id: "control-1",
            ice_id: "ice-1",
            candidate: {
              candidate: "candidate:1 1 udp 1 192.168.1.2 10000 typ host",
              sdpMid: "0",
              sdpMLineIndex: 0,
            },
          },
        },
      },
    ]);
  });

  it("gzips App-shaped restart_ice offers when SDP gzip is enabled", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    const result = await service.sendSignalSoac({
      type: "restart_ice",
      clientId: "controlled-1",
      appControlId: "control-1",
      iceId: "ice-1",
      sdp: "v=0 restart",
      gzipSdp: true,
      iceNetworkType: STREAMER_ICE_NETWORK_TYPES.v4Wlan,
    } as Parameters<RemoteControlService["sendSignalSoac"]>[0] & { iceId: string });

    expect(connector.connections[0].emitWithOptionalAckCalls).toMatchObject([
      {
        event: "soac",
        payload: {
          client_id: "controlled-1",
          data: {
            type: "restart_ice",
            app_control_id: "control-1",
            ice_id: "ice-1",
            sdp: "",
            gzip_sdp: expect.any(Buffer),
            ice_network_type: STREAMER_ICE_NETWORK_TYPES.v4Wlan,
          },
        },
      },
    ]);
    const sentGzipSdp = connector.connections[0].emitWithOptionalAckCalls[0].payload.data.gzip_sdp;
    expect(Buffer.isBuffer(sentGzipSdp)).toBe(true);
    expect(gunzipSync(sentGzipSdp as Buffer).toString("utf8")).toBe("v=0 restart");
    expect(result?.payload).toMatchObject({
      client_id: "controlled-1",
      data: {
        type: "restart_ice",
        ice_id: "ice-1",
        sdp: "",
        gzip_sdp: {
          kind: "binary",
          byteLength: expect.any(Number),
          base64: expect.any(String),
        },
      },
    });
  });
});

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
