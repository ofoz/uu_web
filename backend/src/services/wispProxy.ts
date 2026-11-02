import type { Server as HttpServer } from "node:http";

import { server as wisp } from "@mercuryworkshop/wisp-js/server";

import { createDefaultWispPolicy, type WispTargetPolicy } from "./wispPolicy.js";

export interface SetupWsProxyOptions {
  policy?: WispTargetPolicy;
}

export function setupWsProxy(server: HttpServer, options: SetupWsProxyOptions = {}): void {
  const policy = options.policy ?? createDefaultWispPolicy();

  wisp.options.hostname_whitelist = policy.hostWhitelist;
  wisp.options.port_whitelist = policy.portWhitelist;
  wisp.options.allow_direct_ip = policy.allowDirectIp;
  wisp.options.allow_private_ips = policy.allowPrivateIps;
  wisp.options.allow_loopback_ips = policy.allowLoopbackIps;

  server.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/wisp")) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    wisp.routeRequest(req, socket, head);
  });
}
