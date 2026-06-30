# Project Context

This project is a custom local Figma MCP system for live desktop editing.

## Current Architecture

```text
AI agent
  <-> MCP stdio
Local MCP server
  <-> localhost WebSocket
Figma Desktop plugin
  <-> Figma Plugin API
Current open Figma file
```

## Capabilities

- Inspect the open document, page, selection, and nodes.
- Create and update native Figma nodes.
- Create auto-layout frames, components, text, rectangles, styles, and variables.
- Execute raw local Plugin API calls through guarded MCP tools.
- Batch operations with rollback.
- Auto-configure the plugin from the local server.
- Reconnect after plugin or server restarts.

## Constraints

- Normal editing requires Figma Desktop, a logged-in user, the plugin imported once, the plugin running, and the local MCP server running.
- Server port is `3333` by default because the plugin manifest explicitly allows `localhost:3333`.
- The plugin edits only the current live open file.
- No external Figma credentials are required for normal editing.
- Do not introduce remote file workflows or external Figma file fetching.

## Commands

```bash
./run.sh
./run.sh --check
pnpm build
pnpm typecheck
pnpm doctor
pnpm test:integration
```

## Important Files

- `run.sh`: primary setup/start command.
- `figma-plugin/manifest.json`: Figma Desktop plugin manifest.
- `mcp-server/src/index.ts`: server bootstrap.
- `mcp-server/src/wsHub.ts`: WebSocket bridge.
- `figma-plugin/src/code.ts`: Plugin API executor.
- `figma-plugin/src/ui.ts`: plugin connection UI.
- `shared/src/schemas.ts`: MCP command schemas.
