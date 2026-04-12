#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║         Nexus Terminal — development launch script           ║
# ║  Sources your shell profile so all env vars (API keys,       ║
# ║  PATH, etc.) are inherited by agent terminals.               ║
# ║  Usage: ./run.sh                                             ║
# ╚══════════════════════════════════════════════════════════════╝

set -euo pipefail

BOLD="\033[1m"; CYAN="\033[1;36m"; YELLOW="\033[1;33m"; RESET="\033[0m"

info() { echo -e "${CYAN}▶${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── source shell profiles to pick up env vars (API keys, PATH, nvm, etc.) ──
# shellcheck disable=SC1091
[ -f "$HOME/.profile" ]                          && source "$HOME/.profile"  2>/dev/null || true
[ -f "$HOME/.bashrc" ]                           && source "$HOME/.bashrc"   2>/dev/null || true
[ -n "${ZSH_VERSION:-}" ] && [ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc" 2>/dev/null || true
[ -f "$HOME/.cargo/env" ]                        && source "$HOME/.cargo/env" 2>/dev/null || true

# Also load fnm / nvm if present, so the right Node version is active
if [ -d "$HOME/.local/share/fnm" ]; then
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env --use-on-cd 2>/dev/null || true)"
fi
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
fi

# ── pre-flight checks ──────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  warn "node not found in PATH. Run ./install.sh first, or add Node.js to your PATH."
  exit 1
fi
if ! command -v cargo &>/dev/null; then
  warn "cargo not found in PATH. Run ./install.sh first, or install Rust via https://rustup.rs"
  exit 1
fi

# ── ensure npm deps are installed ─────────────────────────────────
cd "$SCRIPT_DIR"
if [ ! -d node_modules ]; then
  info "node_modules missing — running ${BOLD}npm install${RESET}…"
  npm install
fi

# ── launch ────────────────────────────────────────────────────────
info "Launching ${BOLD}${CYAN}Nexus Terminal${RESET} development server…"
echo -e "   ${YELLOW}Press Ctrl+C to stop.${RESET}"
echo ""
exec npm run tauri dev
