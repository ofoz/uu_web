import net from "node:net";

export type WispRejectReason =
  "direct_ip_not_allowed" | "host_not_allowed" | "loopback_not_allowed" | "port_not_allowed" | "private_ip_not_allowed";

export interface WispTargetPolicy {
  hostWhitelist: RegExp[];
  portWhitelist: number[];
  allowDirectIp: boolean;
  allowPrivateIps: boolean;
  allowLoopbackIps: boolean;
}

export type WispDecision = { allowed: true } | { allowed: false; reason: WispRejectReason };

export function createDefaultWispPolicy(): WispTargetPolicy {
  return {
    hostWhitelist: [
      /^api\.nrd\.nie\.163\.com$/i,
      /^api-dcdn\.nrd\.nie\.163\.com$/i,
      /^api-event\.nrd\.nie\.163\.com$/i,
      /^123\.58\.184\.232$/i,
    ],
    portWhitelist: [443],
    allowDirectIp: false,
    allowPrivateIps: false,
    allowLoopbackIps: false,
  };
}

export function isWispTargetAllowed(host: string, port: number, policy: WispTargetPolicy): WispDecision {
  if (!policy.portWhitelist.includes(port)) {
    return { allowed: false, reason: "port_not_allowed" };
  }

  const normalizedHost = host.trim().toLowerCase();
  const ipVersion = net.isIP(normalizedHost);
  if (ipVersion && !policy.allowDirectIp) {
    return { allowed: false, reason: "direct_ip_not_allowed" };
  }
  if (ipVersion && isLoopbackIp(normalizedHost) && !policy.allowLoopbackIps) {
    return { allowed: false, reason: "loopback_not_allowed" };
  }
  if (ipVersion && isPrivateIp(normalizedHost) && !policy.allowPrivateIps) {
    return { allowed: false, reason: "private_ip_not_allowed" };
  }

  if (!policy.hostWhitelist.some((rule) => rule.test(normalizedHost))) {
    return { allowed: false, reason: "host_not_allowed" };
  }

  return { allowed: true };
}

function isLoopbackIp(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127.");
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    return ip === "::1" || ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd");
  }

  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}
