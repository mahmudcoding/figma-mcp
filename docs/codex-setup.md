# Codex Setup

Codex runs this project as a stdio MCP server.

## Prerequisites

Use Node.js 22.5+ (22, 24, 26+ supported unless proven otherwise).

```bash
cd /absolute/path/to/figma-mcp
./run.sh --check
```

Use an absolute path in Codex config.

## Option 1: CLI

```bash
codex mcp add custom-figma-mcp -- /bin/zsh -lc 'cd /absolute/path/to/figma-mcp && node mcp-server/dist/index.js'
```

Verify:

```bash
codex mcp get custom-figma-mcp
codex mcp list
```

Restart Codex after adding the server. In the Codex TUI, use `/mcp` to verify the server is loaded.

## Option 2: Config File

Codex uses `~/.codex/config.toml` by default.

```toml
[mcp_servers.custom-figma-mcp]
command = "/bin/zsh"
args = ["-lc", "cd /absolute/path/to/figma-mcp && node mcp-server/dist/index.js"]
```

Restart Codex after editing config.

## Verification

1. Start the local server with `./run.sh`.
2. Open Figma Desktop and run `Custom Figma MCP Bridge`.
3. In Codex, use `/mcp`.
4. Ask Codex to call `figma.get_document`.

Expected server health:

```bash
curl http://localhost:3333/health
```

`pluginConnected=true` means Codex can reach the live Figma Desktop plugin through this repo.
