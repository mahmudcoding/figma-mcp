# Production Readiness Checklist

Use this before tagging or publishing the repository.

## Fresh Clone

- [ ] `git clone <repo-url>` works.
- [ ] `cd figma-mcp && ./run.sh --check` passes.
- [ ] `./run.sh` installs dependencies when `node_modules/` is missing.
- [ ] `./run.sh` builds when `dist/` is missing or stale.
- [ ] No committed `.env`, `.data`, `node_modules`, `dist`, logs, coverage, caches, or TypeScript build info.

## Runtime

- [ ] `curl http://localhost:3333/health` returns `ok: true`.
- [ ] `curl http://localhost:3333/plugin/config` returns `ok: true`, a plugin WebSocket URL, and a local token.
- [ ] Figma Desktop plugin loads from `figma-plugin/manifest.json`.
- [ ] Plugin shows friendly status without raw log spam.
- [ ] Plugin reconnects after server restart.
- [ ] `pluginConnected=true` when the plugin is running.
- [ ] A second `node mcp-server/dist/index.js` process can start while port `3333` is already owned by the bridge.
- [ ] That second MCP process uses the local `/ws/mcp` proxy and does not crash with `EADDRINUSE`.

## Live Editing

- [ ] `figma.get_document` reads the current open file.
- [ ] `figma.create_frame` creates a native frame.
- [ ] Text creation loads fonts and creates editable text.
- [ ] Auto-layout creation works.
- [ ] Batch rollback works for failed transactional writes.

## Agent Setup

- [ ] Codex setup in `docs/codex-setup.md` works.
- [ ] Claude Code setup in `docs/claude-code-setup.md` works.
- [ ] Figma setup in `docs/figma-setup.md` works.
- [ ] Codex `/mcp` shows `custom-figma-mcp` after restart.
- [ ] Claude Code `/mcp` shows `custom-figma-mcp` after restart.
- [ ] `AGENTS.md` points future agents to the local desktop bridge only.

## Validation

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.
- [ ] `./run.sh --check` passes in Docker from a clean copy.
- [ ] `pnpm test:integration` passes against a temporary live Figma file.
