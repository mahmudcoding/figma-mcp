# AGENTS.md

## Identity

This repository implements a custom local Figma MCP system for live desktop editing.

Supported architecture:

```text
Codex / Claude Code
  <-> MCP
Custom Local MCP Server
  <-> WebSocket
Custom Figma Desktop Plugin
  <-> Figma Plugin API
Current open Figma Desktop file
```

## Absolute Rules

Never assume or use:

- official Figma MCP
- hosted connector
- browser workflow
- fileKey workflow for editing
- Figma design URL workflow
- Figma web app integration
- REST for normal editing
- OAuth
- Client ID
- Client Secret
- external fetch of Figma files

Normal editing must use only:

- the custom local MCP server in this repo
- the custom Figma Desktop plugin
- local WebSocket transport
- Figma Plugin API
- the current live open Figma Desktop file

## Correct Workflow

Before any Figma task:

1. Verify the server process exists or start it with `./run.sh`.
2. Verify `http://localhost:3333/health`.
3. Verify `pluginConnected=true`.
4. Use custom MCP tools exposed by this repo.
5. Operate on the current open desktop file.

## Blockers

The only valid blocker for normal editing is:

```text
pluginConnected=false
```

Then instruct the user:

```text
Open Figma Desktop.
Open the target file.
Run Plugins -> Development -> Custom Figma MCP Bridge.
```

Do not ask for file keys, design URLs, browser tabs, remote credentials, or external Figma access for normal editing.

## Architecture

The MCP server is a local stdio process launched by Codex or Claude Code. It also runs an HTTP/WebSocket server on `localhost:3333`.

The plugin loads local config from:

```text
http://localhost:3333/plugin/config
```

The plugin connects to:

```text
ws://localhost:3333/ws/plugin
```

The plugin receives MCP commands over WebSocket, executes them through the Figma Plugin API, and returns structured results to the MCP server.

## Important Commands

```bash
./run.sh
./run.sh --check
pnpm install
pnpm build
pnpm typecheck
pnpm doctor
pnpm test:integration
pnpm plugin:build
```

## Debugging

Health:

```bash
curl http://localhost:3333/health
curl http://localhost:3333/status
curl http://localhost:3333/plugin/config
```

Expected healthy state:

```json
{
  "ok": true,
  "pluginConnected": true
}
```

If `pluginConnected=false`, the server is reachable but the Figma plugin is not connected.

Plugin UI:

- Normal mode shows connection state, file, page, and server.
- Diagnostics mode shows WebSocket logs, reconnect attempts, and heartbeat status.
- Raw logs are hidden by default.

## Git Safety

Do not commit, push, open PRs, rewrite history, delete branches, or modify remote state unless the user explicitly changes that rule.
