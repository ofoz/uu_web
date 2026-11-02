import { createServer } from "node:http";

import { createApp } from "./app.js";
import { installFileTee } from "./services/fileTee.js";

const LOG_PATH = process.env.UURC_BACKEND_LOG_PATH ?? "/tmp/uurc-web-backend.log";
const LOG_MAX_BYTES = 5 * 1024 * 1024;
installFileTee(LOG_PATH, LOG_MAX_BYTES);

const { app, config } = createApp();
const server = createServer(app);

if (config.enableWisp) {
  const { setupWsProxy } = await import("./services/wispProxy.js");
  setupWsProxy(server);
}

server.listen(config.port, config.host, () => {
  console.log(`UU RC backend listening at http://${config.host}:${config.port}`);
  console.log(`backend log file: ${LOG_PATH}`);
});
