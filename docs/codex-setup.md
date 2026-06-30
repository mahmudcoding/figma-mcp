# Codex Setup

Codex connects to this project through a local stdio MCP server.

Normal Figma editing still happens through Figma Desktop and the local plugin. Codex does not need a Figma API key, OAuth, a file key, or a Figma design URL.

## Before You Add It

Run this once from the repo:

```bash
cd /absolute/path/to/figma-mcp
./run.sh --check
```

Use the real absolute path on your machine.

## Add To Codex

```bash
codex mcp add custom-figma-mcp -- /bin/zsh -lc 'cd /absolute/path/to/figma-mcp && node mcp-server/dist/index.js'
```

Do not use `./run.sh` as the Codex MCP command. `./run.sh` is for your Terminal. Codex needs the direct `node mcp-server/dist/index.js` command.

If you already added it and want to replace it:

```bash
codex mcp remove custom-figma-mcp
codex mcp add custom-figma-mcp -- /bin/zsh -lc 'cd /absolute/path/to/figma-mcp && node mcp-server/dist/index.js'
```

## Start A Normal Session

1. Open the target file in Figma Desktop.
2. Run this repo:

```bash
cd /absolute/path/to/figma-mcp
./run.sh
```

3. In Figma Desktop, run `Plugins -> Development -> Custom Figma MCP Bridge`.
4. Restart Codex.
5. In Codex, run `/mcp` and look for `custom-figma-mcp`.
6. Ask Codex to call `figma.get_document`.

## Check From Terminal

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

`pluginConnected=true` means the Figma Desktop plugin is connected to the local bridge.

## How Startup Works

The first running server owns `localhost:3333` and talks to the Figma plugin on `/ws/plugin`.

When Codex starts its MCP process, that process checks for the existing local bridge. If it exists, Codex uses the local `/ws/mcp` proxy instead of trying to open port `3333` again.
