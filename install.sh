#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Installing Custom Figma MCP..."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install Node.js, then rerun ./install.sh." >&2
  exit 1
fi

node -e "const major=Number(process.versions.node.split('.')[0]); if (major < 20) { console.error('Node.js 20+ is required. Current: ' + process.version); process.exit(1); }"

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    echo "pnpm not found. Enabling pnpm with Corepack..."
    corepack enable
    corepack prepare pnpm@10.25.0 --activate
  else
    echo "pnpm is required and Corepack is unavailable. Install pnpm, then rerun ./install.sh." >&2
    exit 1
  fi
fi

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Preparing local configuration and build output..."
pnpm run setup

echo "Installation finished."
