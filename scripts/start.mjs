import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";
import {
  checkNodeVersion,
  ensureLocalState,
  fetchJson,
  isBuilt,
  loadLocalEnv,
  printPluginInstructions,
  rootDir,
  run
} from "./lib.mjs";

checkNodeVersion();
ensureLocalState();
loadLocalEnv();

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3333);
const healthUrl = `http://${host}:${port}/health`;
const pluginConfigUrl = `http://${host}:${port}/plugin/config`;

if (!isBuilt()) {
  console.log("Build output is missing. Building now...");
  run("pnpm", ["build"]);
}

const existing = await tryFetch(healthUrl);
if (existing) {
  const pluginConfig = await tryFetch(pluginConfigUrl);
  if (!pluginConfig?.websocketUrl) {
    throw new Error(`Port ${port} is already in use by a process that is not this Custom Figma MCP server.`);
  }
  console.log("Custom Figma MCP is already running.");
  console.log(`Health: ${healthUrl}`);
  console.log(`Plugin connected: ${existing.pluginConnected === true ? "yes" : "no"}`);
  printPluginInstructions(port);
  process.exit(0);
}

console.log("Starting Custom Figma MCP...");
const child = spawn("node", ["mcp-server/dist/index.js"], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    HOST: host,
    PORT: String(port),
    LOG_LEVEL: process.env.LOG_LEVEL || "warn"
  }
});

const shutdown = () => {
  child.kill("SIGTERM");
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  const status = await waitForHealth(healthUrl, 10_000);
  console.log("");
  console.log("Custom Figma MCP is running.");
  console.log(`Health: ${healthUrl}`);
  console.log(`Plugin connected: ${status.pluginConnected === true ? "yes" : "no"}`);
  printPluginInstructions(port);
  console.log("Keep this process running while using Codex with Figma.");
} catch (error) {
  child.kill("SIGTERM");
  throw error;
}

const [code] = await once(child, "exit");
process.exit(typeof code === "number" ? code : 0);

async function waitForHealth(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const body = await tryFetch(url);
    if (body) {
      return body;
    }
    await sleep(250);
  }
  throw new Error(`Server did not become healthy at ${url}`);
}

async function tryFetch(url) {
  try {
    return await fetchJson(url);
  } catch {
    return undefined;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
