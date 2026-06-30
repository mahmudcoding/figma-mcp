import http from "node:http";
import express from "express";
import type { AppConfig } from "./config.js";

export function createHttpServer(
  config: AppConfig,
  getRuntimeStatus: () => Record<string, unknown> = () => ({})
): http.Server {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, ...getRuntimeStatus() });
  });

  app.get("/status", (_req, res) => {
    res.json({ ok: true, ...getRuntimeStatus() });
  });

  app.options("/plugin/config", (req, res) => {
    setPluginConfigCors(res);
    res.status(204).end();
  });

  app.get("/plugin/config", (req, res) => {
    setPluginConfigCors(res);

    if (!isLoopback(req.socket.remoteAddress)) {
      res.status(403).json({ ok: false, error: "Plugin config is only available from localhost." });
      return;
    }

    const pluginHost = getPluginHost(req, config);
    res.json({
      ok: true,
      serverName: "Local MCP",
      websocketUrl: `ws://${pluginHost}/ws/plugin`,
      authToken: config.pluginAuthToken,
      status: getRuntimeStatus()
    });
  });

  return http.createServer(app);
}

function isLoopback(address: string | undefined): boolean {
  return (
    address === undefined ||
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address.startsWith("127.")
  );
}

function setPluginConfigCors(res: express.Response): void {
  res.setHeader("Access-Control-Allow-Origin", "null");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

function getPluginHost(req: express.Request, config: AppConfig): string {
  const hostHeader = req.headers.host;
  if (typeof hostHeader === "string" && isLoopbackHostHeader(hostHeader)) {
    return hostHeader;
  }

  const host = config.host === "0.0.0.0" || config.host === "::" ? "localhost" : config.host;
  return `${host}:${config.port}`;
}

function isLoopbackHostHeader(hostHeader: string): boolean {
  try {
    const hostname = new URL(`http://${hostHeader}`).hostname;
    return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
  } catch {
    return false;
  }
}
