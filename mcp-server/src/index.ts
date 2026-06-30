import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { Database } from "./db/database.js";
import { AuditRepository } from "./db/repositories.js";
import { createHttpServer } from "./http.js";
import { FigmaWebSocketHub } from "./wsHub.js";
import { CommandDispatcher } from "./dispatcher.js";
import { startMcpServer } from "./mcp.js";
import { createLocalBridgeServer, findExistingBridge, LocalBridgeProxyDispatcher } from "./localBridge.js";

const config = loadConfig();
const logger = createLogger(config);

const existingBridge = await findExistingBridge(config);
if (existingBridge) {
  logger.info(
    {
      host: config.host,
      port: config.port
    },
    "Using existing Custom Figma MCP HTTP/WebSocket bridge"
  );
  await startMcpServer(new LocalBridgeProxyDispatcher(config, existingBridge));
} else {
  const database = new Database(config.databasePath);
  database.migrate();

  const audit = new AuditRepository(database.connection);
  let hub: FigmaWebSocketHub | undefined;
  let dispatcher: CommandDispatcher;
  const httpServer = createHttpServer(config, () =>
    hub?.getStatus() ?? { pluginConnected: false, lastPluginHeartbeat: null }
  );
  hub = new FigmaWebSocketHub(config, logger);
  dispatcher = new CommandDispatcher(hub, audit, logger);
  const localBridgeServer = createLocalBridgeServer(config, () => dispatcher, logger);

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
    if (pathname === "/ws/plugin") {
      hub?.handleUpgrade(request, socket, head);
      return;
    }
    if (pathname === "/ws/mcp") {
      localBridgeServer.handleUpgrade(request, socket, head);
      return;
    }
    socket.destroy();
  });

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
    localBridgeServer.close();
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
        pluginWebSocket: `ws://${config.host}:${config.port}/ws/plugin`,
        localMcpWebSocket: `ws://${config.host}:${config.port}/ws/mcp`
      },
      "Custom Figma MCP HTTP/WebSocket server listening"
    );
  });

  const shutdown = () => {
    logger.info("Shutting down");
    localBridgeServer.close();
    hub.close();
    httpServer.close();
    database.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await startMcpServer(dispatcher);
}
