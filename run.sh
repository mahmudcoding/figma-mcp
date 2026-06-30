#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

REQUIRED_NODE_MIN_MAJOR=22
REQUIRED_NODE_MIN_MINOR=5
REQUIRED_PNPM_MAJOR=10
REQUIRED_PNPM_MINOR=25
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3333}"
HEALTH_URL="http://${HOST}:${PORT}/health"
PLUGIN_CONFIG_URL="http://${HOST}:${PORT}/plugin/config"
CHECK_ONLY=0
CHECK_PID=""

if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=1
elif [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'USAGE'
Usage:
  ./run.sh          Install, build, validate, and start the local MCP server.
  ./run.sh --check  Install, build, start briefly, verify health, then exit.

Environment:
  HOST              Server host. Default: 127.0.0.1
  PORT              Server port. Default: 3333
USAGE
  exit 0
elif [[ -n "${1:-}" ]]; then
  echo "Unknown argument: $1" >&2
  exit 1
fi

log() {
  printf '\033[1;34m%s\033[0m %s\n' "figma-mcp" "$*"
}

fail() {
  printf '\033[1;31m%s\033[0m %s\n' "figma-mcp" "$*" >&2
  exit 1
}

have() {
  command -v "$1" >/dev/null 2>&1
}

require_node() {
  have node || fail "Node.js ${REQUIRED_NODE_MIN_MAJOR}.${REQUIRED_NODE_MIN_MINOR}+ is required. Install Node ${REQUIRED_NODE_MIN_MAJOR} or run 'nvm use'."

  local major minor
  major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  minor="$(node -p 'Number(process.versions.node.split(".")[1])')"
  if (( major < REQUIRED_NODE_MIN_MAJOR || (major == REQUIRED_NODE_MIN_MAJOR && minor < REQUIRED_NODE_MIN_MINOR) )); then
    fail "Node.js ${REQUIRED_NODE_MIN_MAJOR}.${REQUIRED_NODE_MIN_MINOR}+ is required because the server uses node:sqlite. Current: $(node --version)"
  fi
}

ensure_pnpm() {
  if ! have pnpm; then
    have corepack || fail "pnpm is missing and Corepack is unavailable. Install pnpm 10.25+ or Node with Corepack."
    log "pnpm not found. Activating pnpm with Corepack..."
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@10.25.0 --activate
  fi

  local version major minor
  version="$(pnpm --version)"
  major="${version%%.*}"
  minor="${version#*.}"
  minor="${minor%%.*}"
  if (( major != REQUIRED_PNPM_MAJOR || minor < REQUIRED_PNPM_MINOR )); then
    fail "pnpm >=10.25.0 <11 is required. Current: ${version}"
  fi
}

install_if_needed() {
  if [[ ! -f node_modules/.modules.yaml || pnpm-lock.yaml -nt node_modules/.modules.yaml || package.json -nt node_modules/.modules.yaml ]]; then
    log "Installing dependencies..."
    pnpm install --frozen-lockfile
  fi
}

ensure_local_state() {
  log "Preparing local configuration..."
  node --input-type=module -e 'import("./scripts/lib.mjs").then((lib) => lib.ensureLocalState())'
}

needs_build() {
  [[ ! -f shared/dist/index.js ]] && return 0
  [[ ! -f mcp-server/dist/index.js ]] && return 0
  [[ ! -f figma-plugin/dist/code.js ]] && return 0
  [[ ! -f figma-plugin/dist/ui.html ]] && return 0

  newer_than shared/tsconfig.tsbuildinfo shared/src scripts/generate-figma-api-schema.mjs && return 0
  newer_than mcp-server/tsconfig.tsbuildinfo mcp-server/src && return 0
  newer_than figma-plugin/dist/ui.html figma-plugin/src shared/src && return 0

  return 1
}

newer_than() {
  local target="$1"
  shift
  [[ ! -f "$target" ]] && return 0
  find "$@" -type f \( -name '*.ts' -o -name '*.html' -o -name '*.mjs' \) \
    -newer "$target" -print -quit | grep -q .
}

build_if_needed() {
  if needs_build; then
    log "Building server, shared package, and Figma plugin..."
    pnpm build
  fi
}

check_existing_server() {
  if curl -fsS "$HEALTH_URL" >/tmp/figma-mcp-health.json 2>/dev/null; then
    if curl -fsS "$PLUGIN_CONFIG_URL" >/dev/null 2>&1; then
      log "Custom Figma MCP is already running at ${HEALTH_URL}."
      return 0
    fi
    fail "Port ${PORT} is in use, but it is not serving this project's plugin config endpoint."
  fi
  return 1
}

run_health_check() {
  if check_existing_server; then
    cat /tmp/figma-mcp-health.json
    printf '\n'
    return 0
  fi

  local log_file
  log_file="$(mktemp -t figma-mcp-check.XXXXXX.log)"
  log "Starting temporary server for health check..."
  HOST="$HOST" PORT="$PORT" LOG_LEVEL=fatal node mcp-server/dist/index.js >"$log_file" 2>&1 &
  CHECK_PID=$!

  cleanup() {
    if [[ -n "${CHECK_PID:-}" ]]; then
      kill "$CHECK_PID" >/dev/null 2>&1 || true
      wait "$CHECK_PID" >/dev/null 2>&1 || true
      CHECK_PID=""
    fi
  }
  trap cleanup EXIT

  for _ in {1..40}; do
    if curl -fsS "$HEALTH_URL" >/tmp/figma-mcp-health.json 2>/dev/null; then
      log "Health check passed at ${HEALTH_URL}."
      cat /tmp/figma-mcp-health.json
      printf '\n'
      return 0
    fi
    sleep 0.25
  done

  echo "Server log:" >&2
  cat "$log_file" >&2 || true
  fail "Server did not become healthy at ${HEALTH_URL}."
}

log "Detected OS: $(uname -s)"
require_node
ensure_pnpm
install_if_needed
ensure_local_state
build_if_needed

if (( CHECK_ONLY == 1 )); then
  run_health_check
  exit 0
fi

log "Starting Custom Figma MCP..."
exec pnpm start
