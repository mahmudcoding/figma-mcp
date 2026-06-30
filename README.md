# Custom Figma MCP

Custom Figma MCP is a local, write-capable bridge between AI agents and the currently open Figma Desktop file.

It is not the hosted or official Figma MCP workflow. Normal canvas editing does not use browser tabs, design URLs, file keys, or REST. Edits run through the Figma Plugin API inside Figma Desktop.

## What It Does

- Exposes MCP tools for document inspection and canvas edits.
- Connects a local MCP server to a Figma Desktop development plugin over WebSocket.
- Creates and updates frames, text, rectangles, components, auto-layout, variables, styles, exports, and batch operations.
- Provides a raw Plugin API bridge for operations that do not need a dedicated ergonomic tool.
- Uses REST only for comments, versions/history, external file fetches, and remote team/library resources.

## Architecture

```text
Codex or another MCP client
  <-> MCP over stdio
Custom local MCP server
  <-> loopback HTTP/WebSocket
Custom Figma Desktop plugin
  <-> Figma Plugin API
Current open Figma file
```

Runtime pieces:

- `mcp-server`: MCP stdio server, HTTP health/config endpoints, WebSocket bridge, OAuth endpoints for REST-only work, validation, dispatch, and audit logging.
- `figma-plugin`: Figma Desktop plugin that auto-discovers the local server, maintains the WebSocket connection, executes Plugin API commands, and returns structured results.
- `shared`: command names, schemas, protocol types, generated API metadata, and structured errors.
- `scripts`: setup, start, doctor, plugin onboarding, and schema generation tooling.

## Quick Start

From a fresh clone:

```bash
./install.sh
pnpm start
```

Then open Figma Desktop:

1. `Plugins -> Development -> Import plugin from manifest...`
2. Select `figma-plugin/manifest.json`
3. Open the target Figma file
4. Run `Plugins -> Development -> Custom Figma MCP Bridge`

The plugin auto-configures from `http://localhost:3333/plugin/config`. You do not paste a WebSocket URL or auth token during normal setup.

Verify:

```bash
curl http://127.0.0.1:3333/health
```

Ready state:

```json
{
  "ok": true,
  "pluginConnected": true,
  "lastPluginHeartbeat": "..."
}
```

## Install Details

`./install.sh` performs the production setup:

- checks Node.js 20+
- enables `pnpm` through Corepack if needed
- installs dependencies from `pnpm-lock.yaml`
- creates local runtime state in `.data/`
- creates `.env` with local defaults if missing
- builds the shared package, MCP server, and Figma plugin
- prints the plugin manifest path

Manual equivalent:

```bash
pnpm install --frozen-lockfile
pnpm run setup
```

## Start Command

Use:

```bash
pnpm start
```

This validates local state, builds if output is missing, starts the MCP/HTTP/WebSocket server on `127.0.0.1:3333`, verifies health, and prints plugin onboarding instructions.

Important local endpoints:

- Health: `http://127.0.0.1:3333/health`
- Status: `http://127.0.0.1:3333/status`
- Plugin auto-config: `http://localhost:3333/plugin/config`
- Plugin WebSocket: `ws://localhost:3333/ws/plugin`
- REST OAuth login: `http://127.0.0.1:3333/auth/login`

## Plugin Experience

Normal mode shows:

- connection status
- current file
- current page
- local server status
- reconnect and diagnostics buttons

Diagnostics are hidden by default. Expand diagnostics only when troubleshooting WebSocket logs, handshake status, heartbeat timing, or advanced connection overrides.

The plugin automatically reconnects after server restarts or temporary disconnects. Keep the plugin window open while an agent edits the file.

## Codex MCP Registration

After setup, register the MCP server with Codex using your local clone path:

```bash
codex mcp add custom-figma-local -- node /path/to/figma-mcp/mcp-server/dist/index.js
```

Restart Codex after registration. The server process started by Codex owns the MCP stdio session and also exposes the local plugin WebSocket.

For human status-only startup, `pnpm start` is useful. For Codex tool calls, Codex should launch `mcp-server/dist/index.js` as the MCP server command.

## Project Structure

```text
figma-plugin/             Figma Desktop plugin source and build output
mcp-server/               MCP stdio, HTTP, WebSocket, OAuth, dispatch, audit server
shared/                   Protocol, schemas, generated API metadata, errors
scripts/                  Installer, start, doctor, plugin info, schema generation
docs/architecture.md      Technical architecture deep dive
docs/production-checklist.md
docs/source-snapshots/    Inputs for schema generation
tests/integration/        Live runtime integration suite
```

Generated and local runtime paths are ignored:

- `node_modules/`
- `dist/`
- `.data/`
- `.env`
- `coverage/`
- `docs/generated/`

## Troubleshooting

Run the doctor:

```bash
pnpm run doctor
```

Plugin not connected:

- Open Figma Desktop.
- Open the target file.
- Run `Plugins -> Development -> Custom Figma MCP Bridge`.
- Confirm the plugin shows `Connected`.

Local server unreachable:

```bash
pnpm start
```

Port conflict:

```bash
lsof -nP -iTCP:3333 -sTCP:LISTEN
```

If another process owns port `3333`, stop it or start this project with another `PORT`.

Authentication failure:

- Restart the server with `pnpm start`.
- Rerun the plugin. It fetches the current token automatically from the loopback-only config endpoint.
- Manual token entry is only needed from the diagnostics panel.

REST OAuth failure:

- REST is not needed for normal canvas editing.
- For comments, versions/history, external file fetches, or remote team resources, set `FIGMA_CLIENT_ID` and `FIGMA_CLIENT_SECRET`, then open `http://127.0.0.1:3333/auth/login`.

## Development

Build:

```bash
pnpm build
```

Typecheck:

```bash
pnpm run typecheck
```

Integration tests:

```bash
pnpm test:integration
```

Plugin manifest info:

```bash
pnpm run plugin:info
```

Refresh API source snapshots:

```bash
pnpm run sources:fetch
```

Extend the system by updating command schemas in `shared/src/schemas.ts`, command names in `shared/src/protocol.ts`, MCP metadata in `mcp-server/src/mcp.ts`, and plugin execution logic in `figma-plugin/src/code.ts`.
