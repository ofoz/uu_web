export interface UuRequest {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface UuResponse<TBody = unknown> {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  body: TBody;
}

export interface TransportResult<TBody = unknown> {
  status: number;
  headers: Record<string, string>;
  body: TBody;
}

export interface UuTransport {
  request<TBody = unknown>(request: UuRequest): Promise<TransportResult<TBody>>;
}
