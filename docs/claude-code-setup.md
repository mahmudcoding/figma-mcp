# Claude Code Setup

Claude Code runs this project as a local stdio MCP server.

## Prerequisites

Use Node.js 22.5+ (22, 24, 26+ supported unless proven otherwise).

```bash
cd /absolute/path/to/figma-mcp
./run.sh --check
```

Use an absolute path in Claude Code config.

## CLI Setup

```bash
claude mcp add --transport stdio custom-figma-mcp -- /bin/zsh -lc 'cd /absolute/path/to/figma-mcp && node mcp-server/dist/index.js'
```

Verify:

```bash
claude mcp list
claude mcp get custom-figma-mcp
```

Restart Claude Code after adding the server. Inside Claude Code, use `/mcp` to inspect connection status.

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

Claude Code may require workspace trust and approval for project-scoped MCP servers.

## Verification

1. Start the local server with `./run.sh`.
2. Open Figma Desktop and run `Custom Figma MCP Bridge`.
3. Run `/mcp` in Claude Code.
4. Ask Claude Code to inspect the open Figma document.

Expected server health:

```bash
curl http://localhost:3333/health
```

`pluginConnected=true` means the desktop plugin is attached to the local bridge.
