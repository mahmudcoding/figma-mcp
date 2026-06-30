import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {
  checkNodeVersion,
  ensureLocalState,
  fetchJson,
  isBuilt,
  loadLocalEnv,
  manifestPath,
  pluginDistPath,
  pluginTokenPath,
  serverDistPath
} from "./lib.mjs";

const checks = [];

await record("Node.js version", async () => checkNodeVersion());
await record("pnpm available", async () => {
  execFileSync("pnpm", ["--version"], { stdio: "ignore" });
});
await record("local state", async () => ensureLocalState());
loadLocalEnv();

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3333);

await record("plugin token", async () => assertFile(pluginTokenPath));
await record("plugin manifest", async () => assertFile(manifestPath));
await record("build output", async () => {
  if (!isBuilt()) {
    throw new Error("Run pnpm build");
  }
  assertFile(pluginDistPath);
  assertFile(serverDistPath);
});
await record("server health", async () => {
  const body = await fetchJson(`http://${host}:${port}/health`);
  if (body.ok !== true) {
    throw new Error("health endpoint did not return ok=true");
  }
});
await record("plugin auto-config", async () => {
  const body = await fetchJson(`http://${host}:${port}/plugin/config`);
  if (!body.websocketUrl || !body.authToken) {
    throw new Error("plugin config endpoint is incomplete");
  }
});

console.log("");
for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.name}${check.message ? ` - ${check.message}` : ""}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  console.log("");
  console.log("Doctor found issues. Run ./install.sh, then pnpm start.");
  process.exit(1);
}

console.log("");
console.log("Doctor passed.");

async function record(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function assertFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${filePath} is missing`);
  }
}
