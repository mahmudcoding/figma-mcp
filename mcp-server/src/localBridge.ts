import crypto from "node:crypto";
import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { Logger } from "pino";
import {
  AppError,
  PluginCommand,
  type PluginCommand as PluginCommandType,
  type StructuredError,
  toStructuredError
} from "@custom-figma-mcp/shared";
import type { AppConfig } from "./config.js";
import { timingSafeEqual } from "./auth.js";

const LOCAL_MCP_WS_PATH = "/ws/mcp";

interface CommandExecutor {
  execute(command: PluginCommandType, payload: unknown): Promise<unknown>;
}

interface BridgeConfig {
  authToken: string;
  mcpWebSocketUrl: string;
}

interface BridgeHelloMessage {
  type: "HELLO";
  requestId: string;
  authToken: string;
}

interface BridgeCommandMessage {
  type: "COMMAND";
  requestId: string;
  authToken: string;
  command: PluginCommandType;
  payload: unknown;
}

type BridgeRequestMessage = BridgeHelloMessage | BridgeCommandMessage;

interface BridgeSuccessMessage {
  requestId: string;
  success: true;
  result: unknown;
}

interface BridgeErrorMessage {
  requestId: string;
  success: false;
  error: StructuredError;
}

type BridgeResponseMessage = BridgeSuccessMessage | BridgeErrorMessage;

export function createLocalBridgeServer(
  config: AppConfig,
  getExecutor: () => CommandExecutor,
  logger: Logger
): LocalBridgeServer {
  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (socket, request) => {
    if (!isLoopback(request.socket.remoteAddress)) {
      socket.close(1008, "Local connections only");
      return;
    }

    socket.once("message", (data) => {
      const hello = parseBridgeMessage(data);
      if (
        !hello ||
        hello.type !== "HELLO" ||
        !isAuthorized(hello.authToken, config.pluginAuthToken)
      ) {
        socket.close(1008, "Unauthorized");
        return;
      }

      sendBridgeResponse(socket, {
        requestId: hello.requestId,
        success: true,
        result: { ok: true }
      });
      socket.on("message", (message) => {
        void handleBridgeCommand(socket, message, config, getExecutor, logger);
      });
    });
  });
  wss.on("error", (error) => logger.error({ error }, "Local MCP bridge WebSocket server failed"));
  return {
    close: () => wss.close(),
    handleUpgrade: (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (client) => {
        wss.emit("connection", client, request);
      });
    }
  };
}

export interface LocalBridgeServer {
  close(): void;
  handleUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer): void;
}

export async function findExistingBridge(config: AppConfig): Promise<BridgeConfig | undefined> {
  let response: Response;
  try {
    response = await fetch(`${localHttpOrigin(config)}/plugin/config`);
  } catch {
    return undefined;
  }

  if (!response.ok) {
    return undefined;
  }

  const body = (await response.json()) as {
    ok?: unknown;
    authToken?: unknown;
    websocketUrl?: unknown;
  };
  if (body.ok !== true || typeof body.authToken !== "string" || typeof body.websocketUrl !== "string") {
    return undefined;
  }

  return {
    authToken: body.authToken,
    mcpWebSocketUrl: pluginWebSocketToMcpWebSocket(body.websocketUrl)
  };
}

export class LocalBridgeProxyDispatcher implements CommandExecutor {
  public constructor(
    private readonly config: AppConfig,
    private readonly bridge: BridgeConfig
  ) {}

  public async execute(command: PluginCommandType, payload: unknown): Promise<unknown> {
    return sendBridgeCommand(this.bridge, command, payload, this.config.requestTimeoutMs);
  }
}

async function handleBridgeCommand(
  socket: WebSocket,
  data: WebSocket.RawData,
  config: AppConfig,
  getExecutor: () => CommandExecutor,
  logger: Logger
): Promise<void> {
  const message = parseBridgeMessage(data);
  if (!message || message.type !== "COMMAND") {
    socket.close(1002, "Invalid command message");
    return;
  }

  if (!isAuthorized(message.authToken, config.pluginAuthToken)) {
    socket.close(1008, "Unauthorized");
    return;
  }

  if (!isPluginCommand(message.command)) {
    sendBridgeResponse(socket, {
      requestId: message.requestId,
      success: false,
      error: toStructuredError(new AppError("VALIDATION_ERROR", "Unknown plugin command"))
    });
    return;
  }

  try {
    const result = await getExecutor().execute(message.command, message.payload);
    sendBridgeResponse(socket, {
      requestId: message.requestId,
      success: true,
      result
    });
  } catch (error) {
    logger.error({ command: message.command, error: toStructuredError(error) }, "Local MCP bridge command failed");
    sendBridgeResponse(socket, {
      requestId: message.requestId,
      success: false,
      error: toStructuredError(error)
    });
  }
}

function sendBridgeCommand(
  bridge: BridgeConfig,
  command: PluginCommandType,
  payload: unknown,
  timeoutMs: number
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(bridge.mcpWebSocketUrl);
    const helloId = crypto.randomUUID();
    const commandId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      socket.close();
      reject(new AppError("PLUGIN_TIMEOUT", `Local MCP bridge timed out for ${command}`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeAllListeners();
    };

    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          type: "HELLO",
          requestId: helloId,
          authToken: bridge.authToken
        } satisfies BridgeHelloMessage)
      );
    });

    socket.on("message", (data) => {
      const response = parseBridgeResponse(data);
      if (!response) {
        cleanup();
        socket.close();
        reject(new AppError("PLUGIN_ERROR", "Local MCP bridge returned an invalid response"));
        return;
      }

      if (response.requestId === helloId) {
        if (!response.success) {
          cleanup();
          socket.close();
          reject(new AppError(response.error.code, response.error.message, response.error.details));
          return;
        }

        socket.send(
          JSON.stringify({
            type: "COMMAND",
            requestId: commandId,
            authToken: bridge.authToken,
            command,
            payload
          } satisfies BridgeCommandMessage)
        );
        return;
      }

      if (response.requestId !== commandId) {
        return;
      }

      cleanup();
      socket.close();
      if (response.success) {
        resolve(response.result);
      } else {
        reject(new AppError(response.error.code, response.error.message, response.error.details));
      }
    });

    socket.on("error", (error) => {
      cleanup();
      reject(new AppError("PLUGIN_ERROR", "Failed to connect to local MCP bridge", toStructuredError(error)));
    });

    socket.on("close", () => {
      cleanup();
      reject(new AppError("PLUGIN_DISCONNECTED", "Local MCP bridge disconnected before responding"));
    });
  });
}

function sendBridgeResponse(socket: WebSocket, message: BridgeResponseMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function parseBridgeMessage(data: WebSocket.RawData): BridgeRequestMessage | undefined {
  try {
    const value = JSON.parse(data.toString()) as Partial<BridgeRequestMessage>;
    if (
      typeof value.type !== "string" ||
      typeof value.requestId !== "string" ||
      typeof value.authToken !== "string"
    ) {
      return undefined;
    }
    return value as BridgeRequestMessage;
  } catch {
    return undefined;
  }
}

function parseBridgeResponse(data: WebSocket.RawData): BridgeResponseMessage | undefined {
  try {
    const value = JSON.parse(data.toString()) as Partial<BridgeResponseMessage>;
    if (typeof value.requestId !== "string" || typeof value.success !== "boolean") {
      return undefined;
    }
    return value as BridgeResponseMessage;
  } catch {
    return undefined;
  }
}

function isAuthorized(candidate: string, expected: string): boolean {
  return timingSafeEqual(candidate, expected);
}

function isPluginCommand(command: unknown): command is PluginCommandType {
  return Object.values(PluginCommand).includes(command as PluginCommandType);
}

function localHttpOrigin(config: AppConfig): string {
  const host = config.host === "0.0.0.0" || config.host === "::" ? "127.0.0.1" : config.host;
  return `http://${host}:${config.port}`;
}

function pluginWebSocketToMcpWebSocket(pluginWebSocketUrl: string): string {
  const url = new URL(pluginWebSocketUrl);
  url.pathname = LOCAL_MCP_WS_PATH;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isLoopback(address: string | undefined): boolean {
  return (
    address === undefined ||
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address.startsWith("127.")
  );
}
