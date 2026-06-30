# Quickstart

From a fresh clone to a running local Figma MCP server:

Prerequisite: Node.js 22.5+ (22, 24, 26+ supported unless proven otherwise).

```bash
git clone <repo-url>
cd figma-mcp
./run.sh
```

One-time Figma setup:

1. Open Figma Desktop and log in.
2. `Plugins -> Development -> Import plugin from manifest...`
3. Select `figma-plugin/manifest.json`.
4. Run `Plugins -> Development -> Custom Figma MCP Bridge`.

Agent setup:

- Codex: follow [docs/codex-setup.md](docs/codex-setup.md).
- Claude Code: follow [docs/claude-code-setup.md](docs/claude-code-setup.md).

Verify:

```bash
curl http://localhost:3333/health
```

`pluginConnected=true` means the server and Figma Desktop plugin are connected.
