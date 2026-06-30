# Project Context

## Current Truth

This repository implements a production-oriented custom local Figma MCP system for controlling the currently open Figma Desktop file.

Normal editing uses:

- custom local MCP server
- custom Figma Desktop plugin
- Figma Plugin API
- current open Figma file

Normal editing does not use browser tabs, design URLs, file keys, hosted connectors, official Figma MCP, or REST.

REST is available only for comments, versions/history, external file fetches, and remote team/library resources.

## Runtime Architecture

```text
AI agent
  <-> MCP stdio
Custom local MCP server
  <-> loopback HTTP/WebSocket
Custom Figma Desktop plugin
  <-> Figma Plugin API
Current open Figma file
```

Defaults:

- server: `127.0.0.1:3333`
- health: `http://127.0.0.1:3333/health`
- plugin config: `http://localhost:3333/plugin/config`
- websocket: `ws://localhost:3333/ws/plugin`
- plugin name: `Custom Figma MCP Bridge`

## Capabilities

- Inspect document, current page, selection, nodes, styles, and variables.
- Create and mutate editable Figma nodes.
- Use auto-layout, components, variables, styles, exports, raw Plugin API calls, and event subscriptions.
- Run transactional batches with rollback.
- Audit command payloads and results.
- Auto-configure the plugin from the local server.
- Reconnect the plugin automatically after disconnects or server restarts.

## Setup Commands

Fresh install:

```bash
./install.sh
```

Start:

```bash
pnpm start
```

Diagnose:

```bash
pnpm run doctor
```

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

## Constraints

- The desktop plugin must be running in the target Figma file.
- The only normal-editing blocker is `pluginConnected: false`.
- The plugin auto-config endpoint is loopback-only.
- Manual token entry is diagnostics-only.
- The system cannot bypass Figma permissions, locked files, locked nodes, unavailable fonts, editor-mode restrictions, or Plugin API runtime limits.

## Repository Boundaries

Keep source and current documentation only.

Do not add non-current narrative files or local runtime output.

Generated/local runtime paths:

- `node_modules/`
- `dist/`
- `.data/`
- `.env`
- `coverage/`
- `docs/generated/`
