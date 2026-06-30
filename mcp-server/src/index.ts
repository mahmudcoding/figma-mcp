import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { Database } from "./db/database.js";
import { AuditRepository } from "./db/repositories.js";
import { createHttpServer } from "./http.js";
import { FigmaWebSocketHub } from "./wsHub.js";
import { CommandDispatcher } from "./dispatcher.js";
import { startMcpServer } from "./mcp.js";

const config = loadConfig();
const logger = createLogger(config);
const database = new Database(config.databasePath);
database.migrate();

const audit = new AuditRepository(database.connection);
let hub: FigmaWebSocketHub | undefined;
const httpServer = createHttpServer(config, () =>
  hub?.getStatus() ?? { pluginConnected: false, lastPluginHeartbeat: null }
);
hub = new FigmaWebSocketHub(httpServer, config, logger);
const dispatcher = new CommandDispatcher(hub, audit, logger);

httpServer.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error(
      {
        host: config.host,
        port: config.port
      },
      "Custom Figma MCP server port is already in use"
    );
  } else {
    logger.error({ error }, "Custom Figma MCP HTTP/WebSocket server failed");
  }
  database.close();
  process.exit(1);
});

httpServer.listen(config.port, config.host, () => {
  logger.info(
    {
      host: config.host,
      port: config.port,
      databasePath: config.databasePath,
      pluginTokenPath: `${config.dataDir}/plugin-auth-token`,
      websocket: `ws://${config.host}:${config.port}/ws/plugin`
    },
    "Custom Figma MCP HTTP/WebSocket server listening"
  );
});

const shutdown = () => {
  logger.info("Shutting down");
  hub.close();
  httpServer.close();
  database.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await startMcpServer(dispatcher);
