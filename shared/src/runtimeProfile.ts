export type UurcRuntime = "node" | "cloudflare-worker";
export type UurcSignalGatewayMode = "node-socket-io" | "cloudflare-durable-object";

export interface RuntimeProfile {
  ok: true;
  runtime: UurcRuntime;
  uuProxyPath: "/api/proxy/uu";
  signalGateway: UurcSignalGatewayMode;
  remoteApiBase: "/api/remote";
  wispProxy: boolean;
}

export function createRuntimeProfile(runtime: UurcRuntime, options: { wispProxy?: boolean } = {}): RuntimeProfile {
  return {
    ok: true,
    runtime,
    uuProxyPath: "/api/proxy/uu",
    signalGateway: runtime === "node" ? "node-socket-io" : "cloudflare-durable-object",
    remoteApiBase: "/api/remote",
    wispProxy: runtime === "node" && options.wispProxy === true,
  };
}
