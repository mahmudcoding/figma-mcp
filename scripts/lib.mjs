import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dataDir = path.join(rootDir, ".data");
export const envPath = path.join(rootDir, ".env");
export const pluginTokenPath = path.join(dataDir, "plugin-auth-token");
export const manifestPath = path.join(rootDir, "figma-plugin", "manifest.json");
export const pluginDistPath = path.join(rootDir, "figma-plugin", "dist", "code.js");
export const serverDistPath = path.join(rootDir, "mcp-server", "dist", "index.js");

export function checkNodeVersion(minMajor = 22, minMinor = 5) {
  const [rawMajor, rawMinor] = process.versions.node.split(".");
  const major = Number.parseInt(rawMajor ?? "0", 10);
  const minor = Number.parseInt(rawMinor ?? "0", 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || major < minMajor || (major === minMajor && minor < minMinor)) {
    throw new Error(`Node.js ${minMajor}.${minMinor}+ is required. Current version: ${process.version}`);
  }
}

export function ensureLocalState() {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  ensureFile(envPath, defaultEnv(), 0o600);
  ensureSecret(pluginTokenPath, 32);
}

export function loadLocalEnv() {
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [rawKey, ...rawValue] = trimmed.split("=");
    const key = rawKey.trim();
    const value = rawValue.join("=").trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function readPluginToken() {
  ensureLocalState();
  return fs.readFileSync(pluginTokenPath, "utf8").trim();
}

export function isBuilt() {
  return fs.existsSync(pluginDistPath) && fs.existsSync(serverDistPath);
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

export async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

export function printPluginInstructions(port = 3333) {
  console.log("");
  console.log("Figma plugin:");
  console.log(`  Manifest: ${manifestPath}`);
  console.log("  Figma Desktop -> Plugins -> Development -> Import plugin from manifest...");
  console.log("  Then run: Plugins -> Development -> Custom Figma MCP Bridge");
  console.log("");
  console.log("The plugin auto-configures from:");
  console.log(`  http://localhost:${port}/plugin/config`);
  console.log("");
}

function ensureSecret(filePath, byteLength) {
  if (fs.existsSync(filePath)) {
    return;
  }
  fs.writeFileSync(filePath, crypto.randomBytes(byteLength).toString("base64url") + "\n", { mode: 0o600 });
}

function ensureFile(filePath, contents, mode) {
  if (fs.existsSync(filePath)) {
    return;
  }
  fs.writeFileSync(filePath, contents, { mode });
}

function defaultEnv() {
  return `# Local development defaults.
HOST=127.0.0.1
PORT=3333
DATABASE_PATH=.data/figma-mcp.sqlite
LOG_LEVEL=warn
REQUEST_TIMEOUT_MS=30000
`;
}
