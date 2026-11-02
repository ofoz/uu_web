import { describe, expect, it } from "vitest";

import { SocketIoSignalGatewayConnector } from "../src/services/socketIoSignalGatewayConnector.js";
import { FakeSocketIoClient } from "./fixtures/signalGateway.js";

describe("SocketIoSignalGatewayConnector", () => {
  it("uses the Engine.IO binary prefix on WebSocket frames", async () => {
    const socket = new FakeSocketIoClient();
    const rawSentFrames: unknown[] = [];
    const rawInboundFrames: unknown[] = [];
    socket.io.engine.transport.ws.send = (data: unknown) => {
      rawSentFrames.push(data);
    };
    socket.io.engine.transport.onData = (data: unknown) => {
      rawInboundFrames.push(data);
    };
    const connector = new SocketIoSignalGatewayConnector(() => socket as never);

    await connector.connect({
      signalServer: "wss://signal-a.example",
      signalServers: ["wss://signal-a.example"],
      headers: {},
      inboundEvents: [],
      socketEvents: {
        control: "control",
        leave: "leave",
        bmsgPush: "bmsg_push",
        publisherDisconnect: "publisher_disconnect",
      },
      controlEvent: "control",
      onSignalEvent: () => {},
    });

    socket.io.engine.transport.ws.send(Buffer.from([0x08, 0x01]));
    socket.io.engine.transport.ws.send(Buffer.from([0x04, 0x08, 0x01]));
    socket.io.engine.transport.onData(Buffer.from([0x04, 0x08, 0x01]));

    expect(rawSentFrames.map((frame) => Buffer.from(frame as Buffer))).toEqual([
      Buffer.from([0x04, 0x08, 0x01]),
      Buffer.from([0x04, 0x04, 0x08, 0x01]),
    ]);
    expect(rawInboundFrames.map((frame) => Buffer.from(frame as Buffer))).toEqual([Buffer.from([0x08, 0x01])]);
  });

  it("captures unknown direct socket.io events for live signal diagnostics", async () => {
    const socket = new FakeSocketIoClient();
    const seenEvents: Array<{ event: string; payload: unknown[] }> = [];
    const connector = new SocketIoSignalGatewayConnector(() => socket as never);

    const connected = connector.connect({
      signalServer: "wss://signal-a.example",
      signalServers: ["wss://signal-a.example"],
      headers: {},
      inboundEvents: ["soac"],
      socketEvents: {
        control: "control",
        leave: "leave",
        bmsgPush: "bmsg_push",
        publisherDisconnect: "publisher_disconnect",
      },
      controlEvent: "control",
      onSignalEvent: (event, payload) => seenEvents.push({ event, payload }),
    });

    await connected;
    socket.dispatch("soac", { data: { type: "answer" } });
    socket.dispatch("server_side_debug", { reason: "not in allowed list" });

    expect(seenEvents).toEqual([
      {
        event: "soac",
        payload: [{ data: { type: "answer" } }],
      },
      {
        event: "server_side_debug",
        payload: [{ reason: "not in allowed list" }],
      },
    ]);
  });

  it("rejects a pending acknowledgement immediately when the connection closes", async () => {
    const socket = new FakeSocketIoClient();
    const connector = new SocketIoSignalGatewayConnector(() => socket as never);
    const connection = await connector.connect({
      signalServer: "wss://signal-a.example",
      signalServers: ["wss://signal-a.example"],
      headers: {},
      inboundEvents: [],
      socketEvents: {
        control: "control",
        leave: "leave",
        bmsgPush: "bmsg_push",
        publisherDisconnect: "publisher_disconnect",
      },
      controlEvent: "control",
      onSignalEvent: () => {},
    });
    const pendingAck = connection.emitWithAck("control", {}, 10_000);

    connection.close();

    await expect(pendingAck).rejects.toThrow("signal socket closed before pending ack");
  });
});
