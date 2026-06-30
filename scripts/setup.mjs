import { checkNodeVersion, ensureLocalState, isBuilt, printPluginInstructions, run } from "./lib.mjs";

console.log("Setting up Custom Figma MCP...");

checkNodeVersion();
ensureLocalState();

console.log("Building server, shared package, and Figma plugin...");
run("pnpm", ["build"]);

if (!isBuilt()) {
  throw new Error("Build finished but required dist files are missing.");
}

console.log("");
console.log("Setup complete.");
console.log("");
console.log("Start the local MCP server:");
console.log("  ./run.sh");
printPluginInstructions();
