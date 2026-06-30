import { ensureLocalState, loadLocalEnv, manifestPath, printPluginInstructions } from "./lib.mjs";

ensureLocalState();
loadLocalEnv();

const port = Number(process.env.PORT || 3333);

printPluginInstructions(port);

console.log("Manual configuration is normally unnecessary.");
console.log("If diagnostics are needed, the plugin can use:");
console.log(`  Config endpoint: http://localhost:${port}/plugin/config`);
console.log(`  WebSocket URL: ws://localhost:${port}/ws/plugin`);
console.log("");
console.log(`Manifest path: ${manifestPath}`);
