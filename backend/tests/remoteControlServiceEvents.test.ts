import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { RemoteControlService } from "../src/services/remoteControlService.js";
import { FakeSignalGatewayConnector, createRoomConfigSource } from "./fixtures/signalGateway.js";

describe("RemoteControlService inbound events", () => {
  it("records inbound App signal events from the backend gateway", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    connector.connectCalls[0].onSignalEvent("soac", [
      {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0" },
      },
    ]);

    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        id: 1,
        direction: "inbound",
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: { type: "answer", sdp: "v=0" },
          },
        ],
      },
    ]);
  });

  it("unwraps bmsg_push SOAC pushes into inbound SOAC events", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    connector.connectCalls[0].onSignalEvent("bmsg_push", [
      JSON.stringify({
        type: "soac",
        data: {
          client_id: "controlled-1",
          data: { type: "answer", sdp: "v=0" },
        },
      }),
    ]);

    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        id: 1,
        direction: "inbound",
        event: "bmsg_push",
      },
      {
        id: 2,
        direction: "inbound",
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: { type: "answer", sdp: "v=0" },
          },
        ],
      },
    ]);
  });

  it("unwraps bmsg_push typed answer pushes into inbound SOAC events", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    connector.connectCalls[0].onSignalEvent("bmsg_push", [
      JSON.stringify({
        type: "answer",
        data: {
          client_id: "controlled-1",
          data: {
            ice_id: "ice-1",
            app_control_id: "control-1",
            sdp: "v=0 typed answer",
          },
        },
      }),
    ]);

    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        id: 1,
        direction: "inbound",
        event: "bmsg_push",
      },
      {
        id: 2,
        direction: "inbound",
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: {
              type: "answer",
              ice_id: "ice-1",
              app_control_id: "control-1",
              sdp: "v=0 typed answer",
            },
          },
        ],
      },
    ]);
  });

  it("normalizes direct typed answer events into inbound SOAC events", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    expect(connector.connectCalls[0].inboundEvents).toContain("answer");
    connector.connectCalls[0].onSignalEvent("answer", [
      {
        client_id: "controlled-1",
        data: {
          ice_id: "ice-1",
          app_control_id: "control-1",
          sdp: "v=0 direct typed answer",
        },
      },
    ]);

    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        id: 1,
        direction: "inbound",
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: {
              type: "answer",
              ice_id: "ice-1",
              app_control_id: "control-1",
              sdp: "v=0 direct typed answer",
            },
          },
        ],
      },
    ]);
  });

  it("normalizes inbound gzip SOAC SDP into browser-readable plain SDP", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    connector.connectCalls[0].onSignalEvent("bmsg_push", [
      {
        type: "soac",
        data: {
          client_id: "controlled-1",
          data: {
            type: "answer",
            sdp: "",
            gzip_sdp: gzipSync(Buffer.from("v=0 controlled answer", "utf8")),
          },
        },
      },
    ]);

    expect(service.getSignalGatewayEvents()).toMatchObject([
      {
        id: 1,
        direction: "inbound",
        event: "bmsg_push",
      },
      {
        id: 2,
        direction: "inbound",
        event: "soac",
        payload: [
          {
            client_id: "controlled-1",
            data: {
              type: "answer",
              sdp: "v=0 controlled answer",
            },
          },
        ],
      },
    ]);
  });

  it("clears stale signal events when the backend gateway is restarted", async () => {
    const connector = new FakeSignalGatewayConnector();
    const service = new RemoteControlService(createRoomConfigSource(), connector);
    await service.startSignalGateway();

    connector.connectCalls[0].onSignalEvent("soac", [
      {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0 stale answer" },
      },
    ]);
    expect(service.getSignalGatewayEvents()).toHaveLength(1);

    await service.startSignalGateway();

    expect(connector.connections[0].closed).toBe(true);
    expect(service.getSignalGatewayEvents()).toEqual([]);
    connector.connectCalls[1].onSignalEvent("soac", [
      {
        client_id: "controlled-1",
        data: { type: "answer", sdp: "v=0 fresh answer" },
      },
    ]);
    expect(service.getSignalGatewayEvents()[0]).toMatchObject({
      id: 1,
      direction: "inbound",
      event: "soac",
    });
  });
});
