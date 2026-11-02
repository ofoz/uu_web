import type { TransportResult, UuRequest, UuTransport } from "@uurc/shared/uuTransport";

interface LibcurlModule {
  libcurl: {
    set_websocket(url: string): void;
    load_wasm(): Promise<void>;
    fetch(
      url: string,
      init: Record<string, unknown>,
    ): Promise<{
      status: number;
      statusText: string;
      raw_headers: Array<[string, string]>;
      text(): Promise<string>;
    }>;
  };
}

export class WasmCurlTransport implements UuTransport {
  private initialized = false;

  constructor(
    private readonly host = "api.nrd.nie.163.com",
    private readonly websocketUrl = buildDefaultWispUrl(),
  ) {}

  async request<TBody = unknown>(request: UuRequest): Promise<TransportResult<TBody>> {
    const { libcurl } = await this.load();
    const response = await libcurl.fetch(`https://${this.host}${request.path}`, {
      method: request.method,
      headers: request.headers ?? {},
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      redirect: "manual",
      _libcurl_http_version: 1.1,
    });
    const text = await response.text();
    const headers = Object.fromEntries(response.raw_headers.map(([key, value]) => [key.toLowerCase(), value]));

    return {
      status: response.status,
      headers,
      body: parseMaybeJson(text, headers["content-type"] ?? "") as TBody,
    };
  }

  private async load(): Promise<LibcurlModule> {
    const mod = (await import("libcurl.js/bundled")) as LibcurlModule;
    if (!this.initialized) {
      mod.libcurl.set_websocket(this.websocketUrl);
      await mod.libcurl.load_wasm();
      this.initialized = true;
    }
    return mod;
  }
}

function buildDefaultWispUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/wisp/`;
}

function parseMaybeJson(text: string, contentType: string): unknown {
  if (!text) return null;
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}
