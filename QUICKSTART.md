# Quickstart

Fresh clone to working local Figma MCP.

## 1. Install

```bash
./install.sh
```

## 2. Start

```bash
pnpm start
```

Keep this process running.

## 3. Import Plugin

In Figma Desktop:

1. `Plugins -> Development -> Import plugin from manifest...`
2. Select `figma-plugin/manifest.json`
3. Open the target Figma file
4. Run `Plugins -> Development -> Custom Figma MCP Bridge`

The plugin connects automatically. No token paste is needed.

## 4. Verify

```bash
curl http://127.0.0.1:3333/health
```

Ready:

```json
{
  "ok": true,
  "pluginConnected": true
}
```

## 5. Use From Codex

Register the MCP server after setup:

```bash
codex mcp add custom-figma-local -- node /path/to/figma-mcp/mcp-server/dist/index.js
```

Restart Codex. Use the custom local Figma MCP tools against the current open Figma Desktop file.

## Troubleshoot

```bash
pnpm run doctor
pnpm run plugin:info
```
