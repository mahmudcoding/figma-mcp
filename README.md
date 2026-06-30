# Custom Figma MCP

Use Codex or Claude Code to inspect and edit the Figma file that is open in Figma Desktop.

This is a local tool. It does not use the official Figma MCP, Figma OAuth, Figma API keys, file keys, or Figma web URLs for normal editing.

## Install First

### 1. Install Requirements

- Figma Desktop
- Node.js 22.5 or newer
- pnpm 10.25 or newer

If pnpm is missing, `./run.sh` will try to enable it with Corepack.

### 2. Start This Project

Open Terminal:

```bash
cd /path/to/figma-mcp
./run.sh
```

Keep this Terminal window open while you use Figma MCP.

### 3. Add The Figma Plugin Once

1. Open Figma Desktop.
2. Go to `Plugins -> Development -> Import plugin from manifest...`.
3. Select `figma-plugin/manifest.json` from this project.
4. Run `Plugins -> Development -> Custom Figma MCP Bridge`.

The plugin should show `Connected`.

### 4. Connect Your AI Tool

For Codex:

```bash
codex mcp add custom-figma-mcp -- /bin/zsh -lc 'cd /path/to/figma-mcp && node mcp-server/dist/index.js'
```

For Claude Code:

```bash
claude mcp add --transport stdio custom-figma-mcp -- /bin/zsh -lc 'cd /path/to/figma-mcp && node mcp-server/dist/index.js'
```

Use the real full path to this folder.

After adding it, restart Codex or Claude Code.

## Daily Use

1. Open the Figma file in Figma Desktop.
2. In Terminal, run:

```bash
cd /path/to/figma-mcp
./run.sh
```

3. In Figma Desktop, run `Plugins -> Development -> Custom Figma MCP Bridge`.
4. Start Codex or Claude Code.
5. Ask it to inspect or edit the open Figma file.

## Check That It Works

Run:

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

If `pluginConnected` is `false`, open Figma Desktop, open your file, and run `Plugins -> Development -> Custom Figma MCP Bridge`.

## What This Does

This project creates a local bridge:

```text
Codex / Claude Code
  -> local MCP server
  -> local WebSocket
  -> Figma Desktop plugin
  -> your open Figma file
```

The AI tool can read and edit the file that is currently open in Figma Desktop.

It can create and update frames, text, rectangles, components, auto-layout frames, styles, variables, and other supported Figma Plugin API objects.

## Common Problems

### The Plugin Says Reconnecting

1. Make sure `./run.sh` is still running.
2. Click `Reconnect` in the plugin.
3. If it still fails, close and run the plugin again from `Plugins -> Development`.

### The Health Check Says pluginConnected false

The local server is running, but Figma Desktop is not connected.

Open Figma Desktop, open the target file, and run `Custom Figma MCP Bridge`.

### Codex Or Claude Does Not Show The Tools

Restart Codex or Claude Code after adding the MCP server.

In Codex or Claude Code, run `/mcp` and look for `custom-figma-mcp`.

## More Help

- Codex setup: [docs/codex-setup.md](docs/codex-setup.md)
- Claude Code setup: [docs/claude-code-setup.md](docs/claude-code-setup.md)
- Figma plugin setup: [docs/figma-setup.md](docs/figma-setup.md)
- Architecture details: [docs/architecture.md](docs/architecture.md)

## Developer Commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm doctor
pnpm test:integration
./run.sh --check
```
