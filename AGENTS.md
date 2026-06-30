# Agent Instructions

## Identity

This repository implements a custom local Figma MCP system.

Architecture:

```text
AI agent
  <-> custom local MCP server
  <-> custom Figma Desktop plugin
  <-> Figma Plugin API
  <-> current open Figma file
```

This is not the hosted or official Figma MCP workflow.

## Absolute Rules

For normal Figma editing, never use:

- hosted Figma connectors
- official Figma MCP
- file keys
- Figma design URLs
- browser URL extraction
- browser-based Figma workflows
- REST

REST is allowed only for comments, versions/history, external file fetches, and remote team/library resources.

## Production Workflow

Fresh setup:

```bash
./install.sh
pnpm start
```

Health check:

```bash
curl http://127.0.0.1:3333/health
```

The plugin auto-configures from:

```text
http://localhost:3333/plugin/config
```

The user should import and run:

```text
Plugins -> Development -> Custom Figma MCP Bridge
```

Manual WebSocket URL and token entry are diagnostics-only. Do not ask the user to paste a token unless auto-configuration is failing and you are actively debugging that failure.

## Correct Figma Task Workflow

Before any Figma operation:

1. Verify a current server is running on `127.0.0.1:3333`.
2. Verify `/health` returns `ok: true`.
3. Verify `pluginConnected: true`.
4. Use only the custom local MCP tools from this repository.
5. Operate on the current open Figma Desktop file.

Useful checks:

```bash
curl http://127.0.0.1:3333/health
curl http://127.0.0.1:3333/status
pnpm run doctor
```

## Only Valid Blocker

The only valid blocker for normal editing is:

```text
pluginConnected: false
```

Tell the user:

```text
Open Figma Desktop, open the target file, and run:
Plugins -> Development -> Custom Figma MCP Bridge
```

Do not ask for a file URL, file key, browser tab, or REST auth.

## Commands

Install:

```bash
./install.sh
```

Build:

```bash
pnpm build
```

Start human-friendly local server:

```bash
pnpm start
```

Run the MCP server directly for an MCP client:

```bash
node mcp-server/dist/index.js
```

Diagnose setup:

```bash
pnpm run doctor
```

Plugin manifest info:

```bash
pnpm run plugin:info
```

Integration tests:

```bash
pnpm test:integration
```

## Debugging

Connection stability:

- `/health` shows `pluginConnected` and `lastPluginHeartbeat`.
- `/plugin/config` provides loopback-only plugin auto-configuration.
- The plugin reconnects automatically after server restarts.
- Server-side heartbeat cleanup terminates stale plugin sockets.
- A newer valid plugin socket replaces the old socket.

Port ownership:

```bash
lsof -nP -iTCP:3333 -sTCP:LISTEN
```

Common failures:

- `pluginConnected: false`: run the desktop plugin in the target file.
- `PLUGIN_DISCONNECTED`: plugin window closed, stale socket terminated, or server restarted.
- `PLUGIN_TIMEOUT`: Figma did not return before `REQUEST_TIMEOUT_MS`.
- `AUTHENTICATION_ERROR`: REST OAuth is missing for REST-only operations.
- `Unauthorized`: diagnostics override has the wrong token; reconnect the plugin normally.

## Code Boundaries

Keep source and current documentation only.

Do not add non-current narrative files or local runtime output.

Generated/local runtime artifacts are not source:

- `node_modules/`
- `dist/`
- `.data/`
- `.env`
- `coverage/`
- `docs/generated/`

## Validation Expectations

For production changes, verify at least:

```bash
pnpm build
pnpm run typecheck
```

For live Figma validation, use this repository's custom MCP server and desktop plugin only. If the live plugin is unavailable, stop at `pluginConnected: false` and give the blocker instruction above.
