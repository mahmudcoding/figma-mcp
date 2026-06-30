# Figma Setup

This project uses Figma Desktop and a local development plugin from this repo.

## Install The Plugin Once

1. Open Figma Desktop.
2. Log in.
3. Start this project in Terminal:

```bash
cd /path/to/figma-mcp
./run.sh
```

4. In Figma Desktop, go to `Plugins -> Development -> Import plugin from manifest...`.
5. Select:

```text
figma-plugin/manifest.json
```

6. Run `Plugins -> Development -> Custom Figma MCP Bridge`.

The plugin loads its settings from:

```text
http://localhost:3333/plugin/config
```

You do not need to type a WebSocket URL or token during normal setup.

## Daily Use

1. Open the Figma file you want to edit.
2. Run this project in Terminal:

```bash
cd /path/to/figma-mcp
./run.sh
```

3. Run `Plugins -> Development -> Custom Figma MCP Bridge`.
4. Confirm the plugin shows `Connected`.
5. Start Codex or Claude Code.

## Check The Connection

```bash
curl http://localhost:3333/health
```

Good result:

```json
{
  "ok": true,
  "pluginConnected": true
}
```

## Fix Common States

If the plugin shows `Server offline`, start `./run.sh` and click `Reconnect`.

If the plugin shows `Reconnecting`, click `Reconnect`. If it still reconnects, close the plugin window and run `Custom Figma MCP Bridge` again from the Figma menu.

If `pluginConnected` is `false`, the server is running but Figma Desktop is not attached. Open the target file and run the plugin again.
