import type { TransportResult, UuRequest, UuTransport } from "@uurc/shared/uuTransport";

export class LocalProxyTransport implements UuTransport {
  constructor(
    private readonly apiBase = "/api",
    private readonly fetcher?: typeof fetch,
  ) {}

  async request<TBody = unknown>(request: UuRequest): Promise<TransportResult<TBody>> {
    const fetcher = this.fetcher ?? fetch;
    const response = await fetcher(`${this.apiBase}/proxy/uu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const headers = Object.fromEntries(response.headers.entries());
    const body = await parseResponseBody(response);

    if (isTransportResult<TBody>(body)) {
      return body;
    }

    return {
      status: response.status,
      headers,
      body: body as TBody,
    };
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function isTransportResult<TBody>(value: unknown): value is TransportResult<TBody> {
  return Boolean(value && typeof value === "object" && "status" in value && "headers" in value && "body" in value);
}
