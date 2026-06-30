import crypto from "node:crypto";
import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import type { Logger } from "pino";
import {
  AppError,
  CommandSchemas,
  PROTOCOL_VERSION,
  type PluginCommand,
  type PluginToServerMessage,
  type ServerToPluginMessage,
  toStructuredError
} from "@custom-figma-mcp/shared";
import type { AppConfig } from "./config.js";
import { timingSafeEqual } from "./auth.js";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  attempts: number;
  message: ServerToPluginMessage;
}

const STALE_PLUGIN_HEARTBEAT_MS = 35_000;
const HEARTBEAT_SWEEP_MS = 5_000;

export class FigmaWebSocketHub {
  private readonly wss: WebSocketServer;
  private activeSocket: WebSocket | undefined;
  private lastPluginHeartbeat: Date | undefined;
  private readonly heartbeatMonitor: NodeJS.Timeout;
  private readonly pending = new Map<string, PendingRequest>();

  public constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger
  ) {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", (socket) => this.handleConnection(socket));
    this.wss.on("error", (error) => this.logger.error({ error }, "Figma plugin WebSocket server failed"));
    this.heartbeatMonitor = setInterval(() => this.terminateStaleConnection(), HEARTBEAT_SWEEP_MS);
  }

  public handleUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(request, socket, head, (client) => {
      this.wss.emit("connection", client, request);
    });
  }

  public isConnected(): boolean {
    return this.activeSocket?.readyState === WebSocket.OPEN;
  }

  public getStatus(): { pluginConnected: boolean; lastPluginHeartbeat: string | null } {
    return {
      pluginConnected: this.isConnected(),
      lastPluginHeartbeat: this.lastPluginHeartbeat?.toISOString() ?? null
    };
  }

  public async sendCommand<TCommand extends PluginCommand>(
    command: TCommand,
    payload: unknown,
    timeoutMs = this.config.requestTimeoutMs
  ): Promise<unknown> {
    if (!this.activeSocket || this.activeSocket.readyState !== WebSocket.OPEN) {
      throw new AppError("PLUGIN_DISCONNECTED", "Figma plugin is not connected");
    }

    const schema = CommandSchemas[command];
    const parsedPayload = schema.parse(payload);
    const requestId = crypto.randomUUID();
    const message: ServerToPluginMessage = {
      type: command,
      requestId,
      authToken: this.config.pluginAuthToken,
      payload: parsedPayload
    } as ServerToPluginMessage;

    return new Promise((resolve, reject) => {
      const pending: PendingRequest = {
        resolve,
        reject,
        attempts: 0,
        message,
        timeout: setTimeout(() => {
          this.pending.delete(requestId);
          reject(new AppError("PLUGIN_TIMEOUT", `Figma plugin timed out for ${command}`));
        }, timeoutMs)
      };
      this.pending.set(requestId, pending);
      this.sendWithRetry(requestId);
    });
  }

  public close(): void {
    clearInterval(this.heartbeatMonitor);
    this.rejectPending(new AppError("PLUGIN_DISCONNECTED", "Figma plugin bridge is shutting down"));
    this.wss.close();
    for (const client of this.wss.clients) {
      client.close(1001, "Server shutting down");
    }
    this.activeSocket?.close(1001, "Server shutting down");
  }

  private handleConnection(socket: WebSocket): void {
    socket.once("message", (data) => {
      const firstMessage = this.parseMessage(data);
      if (
        !firstMessage ||
        !("type" in firstMessage) ||
        firstMessage.type !== "HELLO" ||
        !timingSafeEqual(firstMessage.authToken, this.config.pluginAuthToken)
      ) {
        socket.close(1008, "Unauthorized");
        return;
      }

      if (firstMessage.payload.protocolVersion !== PROTOCOL_VERSION) {
        socket.close(1002, "Unsupported protocol version");
        return;
      }

      if (this.activeSocket && this.activeSocket.readyState === WebSocket.OPEN) {
        this.rejectPending(new AppError("PLUGIN_DISCONNECTED", "Figma plugin connection was replaced"));
        this.activeSocket.close(1000, "Replaced by newer plugin connection");
      }
      this.activeSocket = socket;
      this.lastPluginHeartbeat = new Date();
      this.logger.info(
        {
          fileName: firstMessage.payload.fileName,
          editorType: firstMessage.payload.editorType
        },
        "Figma plugin connected"
      );

      socket.on("message", (message) => this.handleMessage(socket, message));
      socket.on("close", () => this.handleClose(socket));
      socket.on("error", (error) => this.logger.error({ error }, "Figma plugin socket error"));
    });
  }

  private handleMessage(socket: WebSocket, data: WebSocket.RawData): void {
    if (this.activeSocket !== socket) {
      return;
    }

    const message = this.parseMessage(data);
    if (!message) {
      return;
    }

    if ("authToken" in message && !timingSafeEqual(message.authToken, this.config.pluginAuthToken)) {
      socket.close(1008, "Unauthorized");
      return;
    }

    if ("type" in message && message.type === "PING") {
      this.lastPluginHeartbeat = new Date();
      this.activeSocket?.send(
        JSON.stringify({
          type: "PONG",
          requestId: message.requestId,
          authToken: this.config.pluginAuthToken,
          payload: { at: new Date().toISOString() }
        } satisfies ServerToPluginMessage)
      );
      return;
    }

    if (!("success" in message)) {
      return;
    }

    const pending = this.pending.get(message.requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(message.requestId);

    if (message.success) {
      pending.resolve(message.result);
    } else {
      pending.reject(new AppError(message.error.code, message.error.message, message.error.details));
    }
  }

  private handleClose(socket: WebSocket): void {
    if (this.activeSocket !== socket) {
      return;
    }

    this.activeSocket = undefined;
    this.rejectPending(new AppError("PLUGIN_DISCONNECTED", "Figma plugin disconnected"));
    this.logger.warn("Figma plugin disconnected");
  }

  private terminateStaleConnection(): void {
    if (!this.activeSocket || this.activeSocket.readyState !== WebSocket.OPEN || !this.lastPluginHeartbeat) {
      return;
    }

    const heartbeatAgeMs = Date.now() - this.lastPluginHeartbeat.getTime();
    if (heartbeatAgeMs <= STALE_PLUGIN_HEARTBEAT_MS) {
      return;
    }

    this.logger.warn({ heartbeatAgeMs }, "Figma plugin heartbeat timed out");
    this.activeSocket.terminate();
  }

  private rejectPending(error: Error): void {
    for (const [requestId, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }

  private sendWithRetry(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (!pending || !this.activeSocket || this.activeSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      pending.attempts += 1;
      this.activeSocket.send(JSON.stringify(pending.message), (error) => {
        if (!error) {
          return;
        }

        if (pending.attempts < 3) {
          setTimeout(() => this.sendWithRetry(requestId), 100 * pending.attempts);
          return;
        }

        clearTimeout(pending.timeout);
        this.pending.delete(requestId);
        pending.reject(new AppError("PLUGIN_ERROR", error.message));
      });
    } catch (error) {
      clearTimeout(pending.timeout);
      this.pending.delete(requestId);
      pending.reject(new AppError("PLUGIN_ERROR", "Failed to send command", toStructuredError(error)));
    }
  }

  private parseMessage(data: WebSocket.RawData): PluginToServerMessage | undefined {
    try {
      return JSON.parse(data.toString()) as PluginToServerMessage;
    } catch (error) {
      this.logger.warn({ error }, "Invalid WebSocket message");
      return undefined;
    }
  }
}
