export interface SignalGatewayConnectOptions {
  signalServer: string;
  signalServers: string[];
  headers: Record<string, string>;
  timeoutMs?: number;
  reconnectDelayMs?: number;
  inboundEvents: readonly string[];
  socketEvents: Record<string, string>;
  controlEvent: string;
  onSignalEvent(event: string, payload: unknown[]): void;
  onConnectionStateChange?(update: SignalGatewayConnectionStateUpdate): void;
}

export interface SignalGatewayConnectionStateUpdate {
  status: "connecting" | "connected" | "closed" | "error";
  connectionId?: string;
  reason?: string;
}

export interface SignalGatewayConnection {
  id?: string;
  close(): void;
  emitWithAck(event: string, payload: Record<string, unknown>, ackTimeoutMs: number): Promise<unknown[]>;
  emitWithOptionalAck(event: string, payload: Record<string, unknown>, onAck: (ack: unknown[]) => void): Promise<void>;
}

export interface SignalGatewayConnector {
  connect(options: SignalGatewayConnectOptions): Promise<SignalGatewayConnection>;
}
