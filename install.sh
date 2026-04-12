#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║          Nexus Terminal — one-shot install script            ║
# ║  Bootstraps all system deps, builds a release binary, and   ║
# ║  installs it to ~/.local/bin/nexus  (+ desktop entry).       ║
# ║                                                              ║
# ║  Supports: Debian / Ubuntu / Arch / Fedora / openSUSE        ║
# ║  Usage (from repo root):  ./install.sh                       ║
# ║  Usage (curl, no clone):                                     ║
# ║    curl -fsSL https://raw.githubusercontent.com/abhay-byte/nexus/main/install.sh | bash
# ╚══════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── colours ──────────────────────────────────────────────────────
BOLD="\033[1m"; GREEN="\033[1;32m"; YELLOW="\033[1;33m"
RED="\033[1;31m"; CYAN="\033[1;36m"; RESET="\033[0m"

info()    { echo -e "${CYAN}▶${RESET} $*"; }
success() { echo -e "${GREEN}✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET} $*"; }
die()     { echo -e "${RED}✗${RESET} $*" >&2; exit 1; }

# ── constants ─────────────────────────────────────────────────────
REPO_URL="https://github.com/abhay-byte/nexus.git"
APP_NAME="nexus"
INSTALL_DIR="$HOME/.local/bin"
ICONS_DIR="$HOME/.local/share/icons"
DESKTOP_DIR="$HOME/.local/share/applications"
TMP_DIR=""

# ── detect distro pkg manager ─────────────────────────────────────
detect_pkg_manager() {
  if   command -v apt-get  &>/dev/null; then echo "apt"
  elif command -v dnf      &>/dev/null; then echo "dnf"
  elif command -v pacman   &>/dev/null; then echo "pacman"
  elif command -v zypper   &>/dev/null; then echo "zypper"
  else echo "unknown"
  fi
}

# ── install system dependencies (Tauri runtime libs) ─────────────
install_system_deps() {
  local pm; pm=$(detect_pkg_manager)
  info "Installing system dependencies via ${BOLD}${pm}${RESET}…"

  case "$pm" in
    apt)
      sudo apt-get update -qq
      sudo apt-get install -y --no-install-recommends \
        build-essential curl wget file git \
        libwebkit2gtk-4.1-dev \
        libgtk-3-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev \
        libssl-dev \
        libxdo-dev \
        pkg-config
      ;;
    dnf)
      sudo dnf install -y \
        gcc gcc-c++ make curl wget file git \
        webkit2gtk4.1-devel \
        gtk3-devel \
        libayatana-appindicator-gtk3-devel \
        librsvg2-devel \
        openssl-devel \
        pkg-config
      ;;
    pacman)
      sudo pacman -Sy --noconfirm --needed \
        base-devel curl wget file git \
        webkit2gtk-4.1 \
        gtk3 \
        libayatana-appindicator \
        librsvg \
        openssl \
        pkg-config
      ;;
    zypper)
      sudo zypper install -y \
        gcc gcc-c++ make curl wget file git \
        webkit2gtk3-devel \
        gtk3-devel \
        librsvg-devel \
        libopenssl-devel \
        pkg-config
      ;;
    *)
      warn "Unknown package manager — skipping system dep install."
      warn "Please manually install: libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev"
      ;;
  esac
  success "System dependencies installed."
}

# ── install Rust (via rustup) if missing ─────────────────────────
ensure_rust() {
  if command -v cargo &>/dev/null; then
    success "Rust found: $(cargo --version)"
    return
  fi
  info "Rust not found — installing via rustup…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
  success "Rust installed: $(cargo --version)"
}

# ── install Node.js (via fnm) if missing ─────────────────────────
ensure_node() {
  if command -v node &>/dev/null && [[ "$(node -e 'process.exit(+process.versions.node.split(".")[0]<18?1:0)')" == "" ]]; then
    local nv; nv=$(node --version)
    success "Node.js found: $nv"
    return
  fi
  info "Node.js ≥ 18 not found — installing via fnm…"
  curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env --use-on-cd 2>/dev/null || true)"
  fnm install 20
  fnm use 20
  fnm default 20
  success "Node.js installed: $(node --version)"
}

# ── source cargo env (in case this shell didn't have it) ─────────
source_cargo() {
  if [ -f "$HOME/.cargo/env" ]; then
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
  fi
}

# ── clone or update the repo ─────────────────────────────────────
prepare_source() {
  # If we're already inside the repo (run via ./install.sh), use cwd.
  if [ -f "$(pwd)/src-tauri/tauri.conf.json" ]; then
    REPO_DIR="$(pwd)"
    info "Using existing source at ${BOLD}${REPO_DIR}${RESET}"
  else
    # Running via curl pipe — clone to a temp dir.
    TMP_DIR="$(mktemp -d)"
    REPO_DIR="$TMP_DIR/nexus"
    info "Cloning Nexus repository…"
    git clone --depth 1 "$REPO_URL" "$REPO_DIR"
  fi
}

# ── build ─────────────────────────────────────────────────────────
build_app() {
  cd "$REPO_DIR"

  info "Installing npm dependencies…"
  npm install --prefer-offline 2>&1 | tail -5

  info "Building Nexus Terminal (release) — this takes a few minutes…"
  npm run tauri build -- --no-bundle 2>&1 | grep -E "^(error|warning|Compiling|Finished|Building)" || true

  BINARY="$REPO_DIR/src-tauri/target/release/$APP_NAME"
  [ -f "$BINARY" ] || die "Build failed — binary not found at $BINARY"
  success "Build complete."
}

# ── install ───────────────────────────────────────────────────────
install_app() {
  info "Installing to ${BOLD}${INSTALL_DIR}/${APP_NAME}${RESET}…"
  mkdir -p "$INSTALL_DIR"
  cp "$BINARY" "$INSTALL_DIR/$APP_NAME"
  chmod +x "$INSTALL_DIR/$APP_NAME"

  # Desktop entry + icon
  local icon_src="$REPO_DIR/src-tauri/icons/icon.png"
  if [ -f "$icon_src" ]; then
    mkdir -p "$ICONS_DIR" "$DESKTOP_DIR"
    cp "$icon_src" "$ICONS_DIR/nexus.png"
    cat > "$DESKTOP_DIR/nexus-terminal.desktop" <<EOF
[Desktop Entry]
Name=Nexus Terminal
GenericName=AI Agent Terminal
Comment=Multi-agent AI terminal workspace
Exec=${INSTALL_DIR}/${APP_NAME}
Icon=${ICONS_DIR}/nexus.png
Type=Application
Categories=Development;TerminalEmulator;
Keywords=terminal;ai;agent;claude;codex;gemini;
StartupNotify=true
StartupWMClass=Nexus
EOF
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
    success "Desktop entry created."
  fi
}

# ── PATH hint ─────────────────────────────────────────────────────
path_hint() {
  if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
    echo ""
    warn "${INSTALL_DIR} is not in your PATH."
    echo "   Add this to your ~/.bashrc or ~/.zshrc:"
    echo ""
    echo '     export PATH="$HOME/.local/bin:$PATH"'
    echo ""
    echo "   Then reload: source ~/.bashrc"
    echo ""
  fi
}

# ── cleanup ───────────────────────────────────────────────────────
cleanup() {
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

# ═══════════════════════ MAIN ══════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}  🖥  Nexus Terminal Installer${RESET}"
echo -e "  ${YELLOW}Multi-agent AI terminal workspace${RESET}"
echo ""

source_cargo
install_system_deps
ensure_rust
ensure_node
prepare_source
build_app
install_app
path_hint

echo ""
success "${BOLD}Nexus Terminal installed successfully!${RESET}"
echo -e "  Run with: ${BOLD}${CYAN}nexus${RESET}"
echo ""
