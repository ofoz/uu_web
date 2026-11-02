declare module "@mercuryworkshop/wisp-js/server" {
  import type { IncomingMessage } from "node:http";
  import type { Duplex } from "node:stream";

  export const server: {
    options: {
      hostname_whitelist: RegExp[];
      port_whitelist: number[];
      allow_direct_ip: boolean;
      allow_private_ips: boolean;
      allow_loopback_ips: boolean;
    };
    routeRequest(req: IncomingMessage, socket: Duplex, head: Buffer): void;
  };
}
