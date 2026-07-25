import "dotenv/config";
import { createApp } from "./app.js";
import { readServerConfig } from "./config.js";

const config = readServerConfig();
const app = createApp({ config });

const server = app.listen(config.port, config.host, () => {
  console.log(`Cross-Lingual Paper Editor: http://${config.host}:${config.port}`);
});

server.requestTimeout = 185_000;
server.headersTimeout = 190_000;

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
