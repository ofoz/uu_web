import { Router } from "express";

import type { BackendConfig } from "../config.js";
import { createDefaultWispPolicy } from "../services/wispPolicy.js";

export function createDiagnosticsRouter(config: BackendConfig): Router {
  const router = Router();

  router.get("/diagnostics/config", (_req, res) => {
    const policy = createDefaultWispPolicy();
    res.json({
      diagnosticsEnabled: config.enableDiagnostics,
      wisp: {
        enabled: config.enableWisp,
        ports: policy.portWhitelist,
        hosts: policy.hostWhitelist.map((rule) => rule.source),
        allowDirectIp: policy.allowDirectIp,
      },
    });
  });

  return router;
}
