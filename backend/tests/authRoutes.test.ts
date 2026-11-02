import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("gateway-only backend routes", () => {
  it("exposes the same runtime profile shape as the edge deployment", async () => {
    const { app } = createApp({ enableDiagnostics: true });

    const runtime = await request(app).get("/api/runtime").expect(200);

    expect(runtime.body).toEqual({
      ok: true,
      runtime: "node",
      uuProxyPath: "/api/proxy/uu",
      signalGateway: "node-socket-io",
      remoteApiBase: "/api/remote",
      wispProxy: false,
    });
  });

  it("does not expose backend-owned auth, device, or room business endpoints", async () => {
    const { app } = createApp({ enableDiagnostics: true });

    await request(app).get("/api/auth/status").expect(404);
    await request(app).post("/api/auth/import").send({ token: "token-1" }).expect(404);
    await request(app).get("/api/devices").expect(404);
    await request(app).post("/api/rooms/join-by-device").send({ deviceId: "desktop-1" }).expect(404);
  });
});
