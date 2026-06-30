import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

await build({
  entryPoints: [path.join(root, "src", "code.ts")],
  outfile: path.join(dist, "code.js"),
  bundle: true,
  target: "es2017",
  platform: "browser",
  format: "iife",
  sourcemap: false,
  logLevel: "info"
});

await build({
  entryPoints: [path.join(root, "src", "ui.ts")],
  outfile: path.join(dist, "ui.js"),
  bundle: true,
  target: "es2017",
  platform: "browser",
  format: "iife",
  sourcemap: false,
  logLevel: "info"
});

const html = await fs.readFile(path.join(root, "src", "ui.html"), "utf8");
const uiScript = await fs.readFile(path.join(dist, "ui.js"), "utf8");
const inlineUiScript = uiScript.replaceAll("</script", "<\\/script");
await fs.writeFile(
  path.join(dist, "ui.html"),
  html.replace("<!-- UI_SCRIPT -->", () => `<script>\n${inlineUiScript}\n</script>`),
  "utf8"
);
await fs.rm(path.join(dist, "ui.js"));
