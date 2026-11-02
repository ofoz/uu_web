import type { StreamerRoomConfig } from "@uurc/shared/roomConfig";
import type { RemoteRoomJoinContext, RoomJoinUpstreamSummary } from "@uurc/shared/roomSession";

import type { SignalGatewayConnectOptions, SignalGatewayConnector } from "../../src/services/signalGateway.js";

export function createRoomConfigSource(
  overrides: {
    clearByDevice?: (input: { deviceId: string }) => Promise<RoomJoinUpstreamSummary>;
  } = {},
) {
  const roomConfig: StreamerRoomConfig = {
    token: "room-secret-token",
    signalServers: ["wss://signal-a.example", "wss://signal-b.example"],
    timeout: 12000,
    signalReconnectDelay: 1500,
    appData: "{}",
  };
  const joinContext: RemoteRoomJoinContext = {
    capturedAt: "2026-05-15T00:00:00.000Z",
    deviceId: "desktop-1",
    forceJoin: false,
  };

  return {
    getLatestRoomConfig: async () => roomConfig,
    getLatestJoinContext: async () => joinContext,
    clearByDevice: overrides.clearByDevice,
  };
}

export function roomConfigFor(signalServer: string): StreamerRoomConfig {
  return {
    token: "room-secret-token",
    signalServers: [signalServer],
    timeout: 12000,
    signalReconnectDelay: 1500,
    appData: "{}",
  };
}

export class DeferredSignalGatewayConnector implements SignalGatewayConnector {
  readonly connectCalls: SignalGatewayConnectOptions[] = [];
  private readonly pending: Array<{
    resolve(connection: FakeSignalGatewayConnection): void;
  }> = [];

  connect(options: SignalGatewayConnectOptions): Promise<FakeSignalGatewayConnection> {
    this.connectCalls.push(options);
    return new Promise((resolve) => {
      this.pending.push({ resolve });
    });
  }

  resolve(index: number, connectionId: string): FakeSignalGatewayConnection {
    const connection = new FakeSignalGatewayConnection(connectionId);
    this.pending[index].resolve(connection);
    return connection;
  }
}

export class FakeSignalGatewayConnector implements SignalGatewayConnector {
  readonly connectCalls: SignalGatewayConnectOptions[] = [];
  readonly connections: FakeSignalGatewayConnection[] = [];

  constructor(private readonly failure?: Error | ((options: SignalGatewayConnectOptions) => Error | undefined)) {}

  async connect(options: SignalGatewayConnectOptions): Promise<FakeSignalGatewayConnection> {
    this.connectCalls.push(options);
    const failure = typeof this.failure === "function" ? this.failure(options) : this.failure;
    if (failure) throw failure;
    const connection = new FakeSignalGatewayConnection(`fake-signal-${this.connections.length + 1}`);
    this.connections.push(connection);
    return connection;
  }
}

export class FakeSignalGatewayConnection {
  closed = false;
  readonly emitCalls: Array<{
    event: string;
    payload: Record<string, unknown>;
  }> = [];
  readonly emitWithOptionalAckCalls: Array<{
    event: string;
    payload: Record<string, unknown>;
    onAck: (ack: unknown[]) => void;
  }> = [];
  readonly emitWithAckCalls: Array<{
    event: string;
    payload: Record<string, unknown>;
    ackTimeoutMs: number;
  }> = [];

  constructor(readonly id: string) {}

  close(): void {
    this.closed = true;
  }

  async emit(event: string, payload: Record<string, unknown>): Promise<void> {
    this.emitCalls.push({ event, payload });
  }

  async emitWithOptionalAck(
    event: string,
    payload: Record<string, unknown>,
    onAck: (ack: unknown[]) => void,
  ): Promise<void> {
    this.emitWithOptionalAckCalls.push({ event, payload, onAck });
  }

  async emitWithAck(event: string, payload: Record<string, unknown>, ackTimeoutMs: number): Promise<unknown[]> {
    this.emitWithAckCalls.push({ event, payload, ackTimeoutMs });
    return [
      "success",
      {
        code: 0,
        msg: "ok",
        app_data: Buffer.from([1, 2, 3]),
        iceServers: [
          {
            urls: "turn:relay.example:3478?transport=udp",
            username: "turn-user",
            credential: "turn-pass",
          },
        ],
      },
    ];
  }
}

export class FakeSocketIoClient {
  id = "fake-socket";
  connected = false;
  io = {
    engine: {
      transport: {
        ws: {
          send: (_data: unknown) => {},
        },
        onData: (_data: unknown) => {},
      },
    },
  };
  private readonly handlers = new Map<string, Array<(...payload: unknown[]) => void>>();
  private readonly onceHandlers = new Map<string, Array<(...payload: unknown[]) => void>>();
  private readonly anyHandlers: Array<(event: string, ...payload: unknown[]) => void> = [];

  on(event: string, handler: (...payload: unknown[]) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  onAny(handler: (event: string, ...payload: unknown[]) => void): this {
    this.anyHandlers.push(handler);
    return this;
  }

  once(event: string, handler: (...payload: unknown[]) => void): this {
    this.onceHandlers.set(event, [...(this.onceHandlers.get(event) ?? []), handler]);
    return this;
  }

  off(event: string, handler: (...payload: unknown[]) => void): this {
    this.handlers.set(
      event,
      (this.handlers.get(event) ?? []).filter((item) => item !== handler),
    );
    this.onceHandlers.set(
      event,
      (this.onceHandlers.get(event) ?? []).filter((item) => item !== handler),
    );
    return this;
  }

  connect(): void {
    this.connected = true;
    this.dispatch("connect");
  }

  disconnect(): void {
    this.connected = false;
  }

  emit(): void {
    // Not needed for this connector registration test.
  }

  dispatch(event: string, ...payload: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...payload);
    }
    for (const handler of this.onceHandlers.get(event) ?? []) {
      handler(...payload);
    }
    this.onceHandlers.delete(event);
    for (const handler of this.anyHandlers) {
      handler(event, ...payload);
    }
  }
}
