# Quickstart

Use this when you already have the project on your computer.

## 1. Start The Local Server

```bash
cd /path/to/figma-mcp
./run.sh
```

Keep this Terminal window open.

## 2. Start The Figma Plugin

1. Open Figma Desktop.
2. Open the file you want to edit.
3. Run `Plugins -> Development -> Custom Figma MCP Bridge`.

The plugin should show `Connected`.

## 3. Check The Connection

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

## 4. Connect Codex Or Claude Code

- Codex: [docs/codex-setup.md](docs/codex-setup.md)
- Claude Code: [docs/claude-code-setup.md](docs/claude-code-setup.md)

After setup, restart the AI tool and check `/mcp`.
