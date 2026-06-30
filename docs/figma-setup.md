# Figma Setup

This project uses Figma Desktop and the local development plugin manifest in this repo.

## One-Time Setup

1. Install Figma Desktop.
2. Log in to Figma Desktop.
3. Clone this repo and run:

```bash
cd figma-mcp
./run.sh
```

4. In Figma Desktop, choose `Plugins -> Development -> Import plugin from manifest...`.
5. Select `figma-plugin/manifest.json`.
6. Run `Plugins -> Development -> Custom Figma MCP Bridge`.

The plugin automatically loads:

```text
http://localhost:3333/plugin/config
```

No manual URL or token entry is required for the normal path.

## Daily Usage

1. Open the target Figma file in Figma Desktop.
2. Run `./run.sh` from this repo.
3. Run `Plugins -> Development -> Custom Figma MCP Bridge`.
4. Confirm the plugin shows `Connected`.
5. Start Codex or Claude Code with this repo configured as an MCP server.

## Verify Connection

```bash
curl http://localhost:3333/health
```

Expected:

```json
{
  "ok": true,
  "pluginConnected": true
}
```

If the plugin shows `Server offline`, start `./run.sh` and click `Reconnect`.

If the plugin shows `Reconnecting`, open `Diagnostics` only when you need details.
