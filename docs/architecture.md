# Architecture

## Purpose

Custom Figma MCP gives AI agents local read/write access to the currently open Figma Desktop file. Normal canvas edits run through the Figma Plugin API, not through hosted connectors, browser URLs, file keys, or REST.

## Topology

```text
MCP client
  <-> stdio
mcp-server
  <-> loopback HTTP
  <-> loopback WebSocket /ws/plugin
figma-plugin UI iframe
  <-> postMessage
figma-plugin controller
  <-> Figma Plugin API
Current open Figma file
```

## Packages

`shared` owns the protocol contract:

- command constants
- MCP tool names
- Zod payload schemas
- WebSocket message types
- serialized node shapes
- structured errors
- generated API metadata

`mcp-server` owns the local control plane:

- MCP stdio server
- HTTP health/status/config endpoints
- WebSocket server for the plugin
- command validation and dispatch
- audit persistence
- OAuth endpoints for REST-only operations

`figma-plugin` owns the Figma execution plane:

- plugin controller in `code.ts`
- production UI in `ui.ts`
- auto-configuration from the local server
- reconnect and heartbeat handling
- command execution through the Figma Plugin API
- result serialization

`scripts` owns developer experience:

- install/setup helpers
- start command
- doctor command
- plugin info command
- schema generation from source snapshots

## Startup Flow

Fresh setup:

```bash
./install.sh
```

The installer checks Node.js, installs dependencies, creates local runtime state, generates secrets, and builds all packages.

Runtime:

```bash
pnpm start
```

The start command validates local state, builds if output is missing, starts `mcp-server/dist/index.js`, waits for `/health`, and prints plugin onboarding instructions.

For Codex or another MCP client, register:

```bash
node mcp-server/dist/index.js
```

as the MCP server command. The MCP process also hosts the HTTP and WebSocket bridge.

## Plugin Auto-Configuration

The plugin fetches:

```text
GET http://localhost:3333/plugin/config
```

The response includes:

- local server name
- WebSocket URL
- plugin auth token
- current server status

The endpoint is loopback-only. This removes normal token pasting while keeping the token off non-local interfaces.

Manual WebSocket URL and token fields exist only inside the plugin diagnostics panel.

## Protocol Design

The plugin initiates the WebSocket connection with `HELLO`:

- protocol version
- plugin id
- current file name when available
- editor type when available
- auth token

The server validates the token and keeps one active plugin socket. A newer valid plugin connection replaces the old connection and rejects pending requests tied to the previous socket.

Server-to-plugin command messages contain:

- command type
- request id
- auth token
- validated payload

Plugin-to-server result messages contain:

- request id
- `success: true` and result, or
- `success: false` and structured error

## Connection Stability

The plugin:

- auto-connects after launch
- reconnects with capped backoff
- hides raw WebSocket errors in normal mode
- sends `PING` heartbeats every 10 seconds
- updates diagnostics when `PONG` is received

The server:

- records `lastPluginHeartbeat`
- exposes connection state in `/health` and `/status`
- terminates stale plugin sockets after missed heartbeats
- rejects pending requests when a socket is replaced or disconnected
- closes all plugin sockets during shutdown

This supports long sessions and graceful recovery after server restarts.

## Authentication

The WebSocket bridge uses `PLUGIN_AUTH_TOKEN`. If not provided, setup/server startup creates `.data/plugin-auth-token`.

The plugin receives the token through the loopback-only config endpoint. Diagnostics can override the token manually for debugging.

OAuth is separate and optional. It is used only for REST-backed operations such as comments, versions/history, external file fetches, or remote team resources. Canvas editing does not require OAuth.

## MCP Tool Design

Ergonomic tools cover common operations:

- document, page, and selection inspection
- node lookup
- frame, text, rectangle, component, and auto-layout creation
- node update, move, resize, delete, duplicate
- export
- list styles and variables
- update variables
- batch operations

Raw bridge tools expose broader Plugin API coverage:

- `figma.create_node`
- `figma.call_api`
- `figma.get_property`
- `figma.set_property`
- `figma.get_api_schema`

Raw bridge targets include `figma`, root, current page, selection, nodes, pages, styles, variables, variable collections, images, `figma.variables`, `figma.teamLibrary`, `figma.codegen`, `figma.devResources`, `figma.parameters`, `figma.ui`, `figma.clientStorage`, and nested paths.

## Schema Generation

`scripts/generate-figma-api-schema.mjs` parses local snapshots and writes:

- `shared/src/figmaApiSchema.generated.ts`
- `docs/generated/figma-api-schema.json`
- `docs/generated/completeness-audit.json`

The generated TypeScript module is runtime source. The generated JSON files are local build artifacts.

## Batching And Rollback

`figma.batch_operations` executes up to 100 validated operations.

When `transactional` and `rollbackOnError` are enabled, the plugin creates an undo boundary before the batch. If any operation fails, it triggers undo and returns the failure so multi-step edits do not leave partial canvas state.

## Persistence

SQLite stores:

- users
- encrypted Figma OAuth tokens
- audit logs

The database lives under `.data/` by default and is local runtime state.

## Constraints

The target is always the current open Figma Desktop file.

The only normal-editing blocker is `pluginConnected: false`. In that case, the user must open Figma Desktop, open the target file, and run `Plugins -> Development -> Custom Figma MCP Bridge`.

The system cannot bypass Figma permissions, locked nodes, unavailable fonts, editor restrictions, or Plugin API runtime limits.
