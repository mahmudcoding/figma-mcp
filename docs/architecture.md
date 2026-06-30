# Architecture

Custom Figma MCP is a local, write-capable bridge from an AI agent to the current open Figma Desktop file.

## Runtime Model

```text
Codex / Claude Code
  <-> MCP stdio
Custom Local MCP Server
  <-> HTTP config + WebSocket commands
Custom Figma MCP Bridge plugin
  <-> Figma Plugin API
Live open Figma Desktop file
```

## Protocol Design

The shared protocol lives in `shared/src/protocol.ts` and `shared/src/schemas.ts`.

Message families:

- `HELLO`: plugin announces protocol version, plugin id, file name, and editor type.
- `PING` / `PONG`: heartbeat and liveness.
- command messages: server sends a `PluginCommand` and validated payload.
- result messages: plugin returns structured success or error payloads.

MCP tools map one-to-one to `PluginCommand` values. The MCP server validates every payload with Zod before dispatch.

## Local Authentication

The server and plugin use a generated local `PLUGIN_AUTH_TOKEN` to reject unrelated WebSocket clients. `./run.sh` creates `.data/plugin-auth-token` automatically.

This token is local machine state. It is not a Figma credential and does not grant access to external files. It only authenticates the desktop plugin connection to the local server.

## Transport

The MCP server uses stdio for the agent connection.

The server also listens on `127.0.0.1:3333` by default:

- `GET /health`
- `GET /status`
- `GET /plugin/config`
- `ws://localhost:3333/ws/plugin`

The Figma plugin fetches `/plugin/config`, receives the WebSocket URL and local token, then opens the WebSocket connection.

## Plugin Runtime

The plugin has two layers:

- `figma-plugin/src/ui.ts`: connection state, reconnect loop, heartbeat, diagnostics panel.
- `figma-plugin/src/code.ts`: command execution against the Figma Plugin API.

The UI hides raw diagnostics by default. User-facing states are `Connecting`, `Connected`, `Server offline`, `Reconnecting`, and `Paused`.

## MCP Tool Design

Core tool categories:

- document reads: document, current page, selection, node lookup, node search
- node writes: create, update, move, resize, delete, duplicate
- assets and metadata: export, local styles, local variables
- raw local Plugin API: call method, get property, set property
- events: subscribe, unsubscribe, poll
- batches: execute ordered operations with rollback

The server exposes only local Plugin API based tools. Canvas mutations are tracked for audit logging.

## Schema Generation

`scripts/generate-figma-api-schema.mjs` reads installed Figma plugin typings from `@figma/plugin-typings` and generates:

- `docs/generated/figma-api-schema.json`
- `docs/generated/completeness-audit.json`
- `shared/src/figmaApiSchema.generated.ts`

Generated metadata intentionally omits copied prose documentation and unsupported external-resource surfaces. This keeps the repo focused on the local desktop bridge.

## Batching

`figma.batch_operations` accepts up to 100 operations. By default it is transactional:

- operation results are collected in order
- created and mutated node ids are tracked
- a failure triggers undo-backed rollback
- `continueOnError` can be enabled for non-transactional workflows

## Rollback

Rollback uses Figma undo boundaries from the plugin runtime. When a transactional batch fails, the plugin triggers undo for changes performed in the batch and returns a structured failure result.

## Persistence

The server stores audit logs in SQLite under `.data/figma-mcp.sqlite`. `.data/` is local-only and ignored by git.
