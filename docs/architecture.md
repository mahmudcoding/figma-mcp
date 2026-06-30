# Architecture

Custom Figma MCP is a local, write-capable bridge from an AI agent to the currently open Figma Desktop file.

It is not the official Figma MCP. Normal editing does not use Figma OAuth, Figma REST, file keys, design URLs, or the Figma web app.

## Runtime Model

```text
Codex / Claude Code
  <-> MCP over stdio
Custom Local MCP Server
  <-> local WebSocket
Custom Figma MCP Bridge plugin
  <-> Figma Plugin API
Current open Figma Desktop file
```

## Server Roles

The MCP server process has two jobs:

1. Speak MCP over stdio to Codex or Claude Code.
2. Host the local HTTP/WebSocket bridge on `localhost:3333`.

Only one process can own `localhost:3333`. If the bridge is already running, a new stdio MCP process uses the local `/ws/mcp` proxy instead of opening the port again.

This lets Codex and Claude Code start their own MCP stdio processes without breaking the already-running Figma plugin connection.

## Local Endpoints

Default HTTP endpoints:

- `GET /health`
- `GET /status`
- `GET /plugin/config`

Default WebSocket endpoints:

- `ws://localhost:3333/ws/plugin` for the Figma Desktop plugin
- `ws://localhost:3333/ws/mcp` for local MCP proxy processes

The server routes WebSocket upgrades by path so the plugin socket and MCP proxy socket do not conflict.

## Plugin Startup

The Figma plugin fetches:

```text
http://localhost:3333/plugin/config
```

The response includes:

- the plugin WebSocket URL
- the local auth token
- current connection status

The plugin then opens `/ws/plugin`, sends `HELLO`, and starts heartbeat messages.

## MCP Startup

The MCP entrypoint is:

```bash
node mcp-server/dist/index.js
```

Startup behavior:

1. Load local config.
2. Check whether a compatible bridge already answers `/plugin/config`.
3. If found, start MCP stdio and forward tool calls through `/ws/mcp`.
4. If not found, start the HTTP/WebSocket bridge and MCP stdio in the same process.

`./run.sh` is a human-facing helper for install/build/start. It is not the command to put inside Codex or Claude Code MCP config.

## Protocol Design

The shared protocol lives in:

- `shared/src/protocol.ts`
- `shared/src/schemas.ts`

Message families:

- `HELLO`: plugin or proxy authenticates to the local server.
- `PING` / `PONG`: heartbeat and liveness.
- command messages: MCP tools map to local plugin commands.
- result messages: plugin returns structured success or error payloads.

The MCP server validates payloads with Zod before dispatch.

## Local Authentication

The server creates a local token at:

```text
.data/plugin-auth-token
```

The token is used only on this machine to reject unrelated local WebSocket clients. It is not a Figma credential and does not grant access to external Figma files.

## Plugin Runtime

The plugin has two layers:

- `figma-plugin/src/ui.ts`: connection state, reconnect loop, heartbeat, diagnostics panel.
- `figma-plugin/src/code.ts`: command execution through the Figma Plugin API.

User-facing states are `Connecting`, `Connected`, `Server offline`, `Reconnecting`, and `Paused`.

## Tool Categories

- Read document, current page, selection, nodes, styles, and variables.
- Create frames, text, rectangles, components, and auto-layout frames.
- Update, move, resize, duplicate, delete, and export nodes.
- Call selected local Figma Plugin API methods and properties.
- Subscribe to, unsubscribe from, and poll local plugin events.
- Run batch operations with rollback.

## Schema Generation

`scripts/generate-figma-api-schema.mjs` reads installed Figma plugin typings from `@figma/plugin-typings` and generates:

- `docs/generated/figma-api-schema.json`
- `docs/generated/completeness-audit.json`
- `shared/src/figmaApiSchema.generated.ts`

Generated metadata intentionally avoids copied prose documentation and keeps this repo focused on the local desktop bridge.

## Persistence

Audit logs are stored in SQLite under:

```text
.data/figma-mcp.sqlite
```

`.data/` is local-only and ignored by git.
