# Production Readiness Checklist

Use this checklist before publishing or handing the repository to another developer.

## Fresh Clone

- [ ] Repository contains no local runtime state.
- [ ] `.env` is absent and `.env.example` is present.
- [ ] `node_modules/`, `dist/`, `.data/`, `coverage/`, and `docs/generated/` are absent or ignored.
- [ ] No hardcoded personal paths are present.

## Install

- [ ] `./install.sh` runs successfully on a clean checkout.
- [ ] Node.js 20+ is detected.
- [ ] `pnpm` is available or enabled through Corepack.
- [ ] Dependencies install from `pnpm-lock.yaml`.
- [ ] `.env` is generated when missing.
- [ ] `.data/plugin-auth-token` is generated when missing.
- [ ] `pnpm build` completes.

## Start

- [ ] `pnpm start` starts the local server.
- [ ] `http://127.0.0.1:3333/health` returns `ok: true`.
- [ ] `http://localhost:3333/plugin/config` returns WebSocket URL and auth token from loopback.
- [ ] A conflicting process on port `3333` produces a clear failure.

## Plugin

- [ ] Figma Desktop can import `figma-plugin/manifest.json`.
- [ ] Running `Custom Figma MCP Bridge` shows production UI, not raw debug fields.
- [ ] Plugin auto-configures without manual token paste.
- [ ] Plugin shows `Connected` when the server is running.
- [ ] Diagnostics are hidden by default.
- [ ] Diagnostics show logs, endpoint, WebSocket URL, token override, and heartbeat info when expanded.

## Connection Stability

- [ ] Plugin reconnects after server restart.
- [ ] Normal UI shows human-readable messages.
- [ ] Raw WebSocket errors are only in diagnostics.
- [ ] `/health` shows `pluginConnected` and `lastPluginHeartbeat`.
- [ ] Stale sockets are cleaned up after missed heartbeats.
- [ ] Duplicate plugin connections replace older sockets cleanly.

## Live Editing

- [ ] `figma.get_document` reads the current open file.
- [ ] `figma.get_current_page` reads the current page.
- [ ] `figma.get_selection` reads selected nodes.
- [ ] `figma.create_rectangle` creates and verifies a visible rectangle.
- [ ] `figma.create_frame`, `figma.create_text`, and `figma.create_autolayout` create an intermediate frame with text and button.
- [ ] A landing page can be created with navbar, hero, CTA component, features section, variables, and auto-layout.

## Documentation

- [ ] `README.md` matches the actual setup and start flow.
- [ ] `QUICKSTART.md` gets a new developer running quickly.
- [ ] `AGENTS.md` states the custom-local-only workflow and valid blocker.
- [ ] `PROJECT_CONTEXT.md` contains current truths only.
- [ ] `docs/architecture.md` matches the current server/plugin/protocol behavior.

## Final Command Gate

```bash
./install.sh
pnpm start
pnpm run doctor
pnpm build
pnpm run typecheck
```

Run live Figma validation through the custom local MCP server and desktop plugin before release.
