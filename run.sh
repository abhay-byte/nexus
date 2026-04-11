#!/usr/bin/env bash
# Nexus Terminal — launch script
# Sources your shell profile so all env vars (API keys, PATH, etc.) are inherited by agent terminals.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shell profile to pick up env vars set in .bashrc / .zshrc / .profile
# This ensures tools like Claude Code, Codex etc. can find their API tokens.
if [ -f "$HOME/.bashrc" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.bashrc" 2>/dev/null || true
fi
if [ -f "$HOME/.profile" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.profile" 2>/dev/null || true
fi
if [ -f "$HOME/.zshrc" ] && [ -n "$ZSH_VERSION" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.zshrc" 2>/dev/null || true
fi

cd "$SCRIPT_DIR"

# If a release binary exists, use it. Otherwise fall back to dev mode.
RELEASE_BIN="$SCRIPT_DIR/src-tauri/target/release/nexus"
DEV_BIN="$SCRIPT_DIR/src-tauri/target/debug/nexus"

if [ -f "$RELEASE_BIN" ]; then
  echo "▶ Launching Nexus Terminal (release)..."
  exec "$RELEASE_BIN" "$@"
elif [ -f "$DEV_BIN" ]; then
  echo "▶ Launching Nexus Terminal (dev build)..."
  exec "$DEV_BIN" "$@"
else
  echo "▶ No binary found — starting dev server (npm run tauri dev)..."
  exec npm run tauri dev
fi
