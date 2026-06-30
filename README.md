# Custom Figma MCP

Custom Figma MCP is a local bridge that lets AI coding agents inspect and edit the currently open Figma Desktop file. The system is built from a local MCP stdio server, a Figma Desktop development plugin, and a WebSocket connection between them.

Normal design editing happens inside Figma Desktop through the Figma Plugin API. The AI agent never needs a Figma API credential or external file access for canvas work.

## Overview

Capabilities:

- Read the open document, current page, selection, and node tree.
- Create and update frames, text, rectangles, components, variables, styles, and auto-layout nodes.
- Run batch operations with undo-backed rollback.
- Call supported local Plugin API surfaces through a typed MCP tool contract.
- Auto-configure the plugin from the local server at `http://localhost:3333/plugin/config`.
- Reconnect automatically when the server or plugin restarts.

## Architecture

Runtime flow:

```text
Codex / Claude Code
  <-> MCP stdio
Custom Local MCP Server
  <-> WebSocket on localhost:3333
Custom Figma MCP Bridge plugin
  <-> Figma Plugin API
Live current open Figma Desktop file
```

Main pieces:

- `mcp-server`: MCP stdio server, HTTP health/config endpoint, WebSocket hub, command dispatcher, audit logging.
- `figma-plugin`: Figma Desktop plugin UI and Plugin API executor.
- `shared`: protocol constants, Zod schemas, generated Plugin API metadata, shared error types.
- `scripts`: setup, start, doctor, schema generation, and plugin helper scripts.

The server exposes:

- `GET /health`
- `GET /status`
- `GET /plugin/config`
- `ws://localhost:3333/ws/plugin`

## Setup

Prerequisites:

- Figma Desktop installed and logged in.
- Node.js 22.5 or newer on major version 22. The server uses `node:sqlite`.
- `pnpm` 10.25 or newer. `./run.sh` can enable it through Corepack when available.

Fresh clone:

```bash
git clone <repo-url>
cd figma-mcp
./run.sh
```

`./run.sh` detects the OS, validates Node and pnpm, installs dependencies, creates local config, builds the server/plugin, checks health, and starts the local MCP server.

Import the plugin once:

1. Open Figma Desktop.
2. Go to `Plugins -> Development -> Import plugin from manifest...`.
3. Select `figma-plugin/manifest.json`.
4. Run `Plugins -> Development -> Custom Figma MCP Bridge`.

Configure your agent:

- Codex: see [docs/codex-setup.md](docs/codex-setup.md).
- Claude Code: see [docs/claude-code-setup.md](docs/claude-code-setup.md).

## Usage

Daily flow:

1. Open the target file in Figma Desktop.
2. Start this repo with `./run.sh`.
3. Run `Custom Figma MCP Bridge` from Figma Desktop.
4. Start Codex or Claude Code with the configured MCP server.
5. Ask the agent to inspect or edit the current open file.

Verify connection:

```bash
curl http://localhost:3333/health
pnpm doctor
```

Healthy output includes `ok: true`. When the plugin is running, `pluginConnected` is `true`.

## Project Structure

```text
figma-plugin/          Figma Desktop plugin source, manifest, and build script
mcp-server/            Local MCP stdio server, WebSocket hub, HTTP health/config
shared/                Shared protocol, schemas, generated Plugin API metadata
scripts/               Setup, start, doctor, schema generation, plugin info
tests/integration/     Live runtime integration tests against Figma Desktop
docs/                  Architecture, setup guides, production checklist
run.sh                 Primary one-command setup/start entrypoint
```

Ignored local state:

- `.env`
- `.data/`
- `node_modules/`
- `dist/`
- `coverage/`
- logs, caches, and TypeScript build info

## Troubleshooting

Plugin not connected:

- Open Figma Desktop.
- Open the target file.
- Run `Plugins -> Development -> Custom Figma MCP Bridge`.
- Check `curl http://localhost:3333/health`.

Localhost unreachable:

- Start the server with `./run.sh`.
- Make sure port `3333` is free.
- Check `HOST` and `PORT` in `.env`.

WebSocket failure:

- Keep `./run.sh` running.
- Click `Reconnect` in the plugin.
- Open `Diagnostics` only if you need logs.
- Restart the plugin after rebuilding plugin code.

Plugin config failure:

- Confirm `http://localhost:3333/plugin/config` returns `ok: true`.
- Confirm `figma-plugin/manifest.json` allows `http://localhost:3333` and `ws://localhost:3333`.

## Development

Common commands:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm doctor
pnpm test:integration
./run.sh --check
```

Extend the system by adding or updating shared command schemas in `shared/src/schemas.ts`, implementing Plugin API behavior in `figma-plugin/src/code.ts`, and exposing MCP metadata in `mcp-server/src/mcp.ts`. Keep the MCP server local and keep design edits routed through the Figma Desktop plugin.
