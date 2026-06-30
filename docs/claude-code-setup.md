# Claude Code Setup

Claude Code connects to this project through a local stdio MCP server.

Normal Figma editing still happens through Figma Desktop and the local plugin. Claude Code does not need a Figma API key, OAuth, a file key, or a Figma design URL.

## Before You Add It

Run this once from the repo:

```bash
cd /absolute/path/to/figma-mcp
./run.sh --check
```

Use the real absolute path on your machine.

## Add To Claude Code

```bash
claude mcp add --transport stdio custom-figma-mcp -- /bin/zsh -lc 'cd /absolute/path/to/figma-mcp && node mcp-server/dist/index.js'
```

Do not use `./run.sh` as the Claude Code MCP command. `./run.sh` is for your Terminal. Claude Code needs the direct `node mcp-server/dist/index.js` command.

Verify:

```bash
claude mcp list
claude mcp get custom-figma-mcp
```

## Project Config Alternative

For a project-scoped setup, create `.mcp.json` in the project that should use Figma MCP:

```json
{
  "mcpServers": {
    "custom-figma-mcp": {
      "command": "/bin/zsh",
      "args": [
        "-lc",
        "cd /absolute/path/to/figma-mcp && node mcp-server/dist/index.js"
      ]
    }
  }
}
```

Claude Code may ask you to trust the workspace before using project-scoped MCP servers.

## Start A Normal Session

1. Open the target file in Figma Desktop.
2. Run this repo:

```bash
cd /absolute/path/to/figma-mcp
./run.sh
```

3. In Figma Desktop, run `Plugins -> Development -> Custom Figma MCP Bridge`.
4. Restart Claude Code.
5. In Claude Code, run `/mcp` and look for `custom-figma-mcp`.
6. Ask Claude Code to inspect the open Figma document.

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

When Claude Code starts its MCP process, that process checks for the existing local bridge. If it exists, Claude Code uses the local `/ws/mcp` proxy instead of trying to open port `3333` again.
