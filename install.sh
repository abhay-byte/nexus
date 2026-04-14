#!/usr/bin/env bash

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
CYAN="\033[1;36m"
RESET="\033[0m"

info()    { echo -e "${CYAN}▶${RESET} $*"; }
success() { echo -e "${GREEN}✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET} $*"; }
die()     { echo -e "${RED}✗${RESET} $*" >&2; exit 1; }

APP_NAME="nexus"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
ICONS_DIR="$XDG_DATA_HOME/icons/hicolor/512x512/apps"
DESKTOP_DIR="$XDG_DATA_HOME/applications"
RELEASE_BASE="${RELEASE_BASE:-https://github.com/abhay-byte/nexus/releases/latest/download}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

download() {
  local url="$1"
  local output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
    return
  fi

  die "install requires curl or wget"
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) die "unsupported Linux architecture: $(uname -m)" ;;
  esac
}

install_binary() {
  local arch="$1"
  local asset="Nexus_linux_${arch}.tar.gz"
  local archive="$TMP_DIR/$asset"
  local extract_dir="$TMP_DIR/extract"
  local package_dir="$extract_dir/Nexus_linux_${arch}"

  mkdir -p "$extract_dir" "$INSTALL_DIR" "$ICONS_DIR" "$DESKTOP_DIR"

  info "Downloading ${BOLD}${asset}${RESET} from the latest release…"
  download "$RELEASE_BASE/$asset" "$archive"

  info "Extracting package…"
  tar -xzf "$archive" -C "$extract_dir"

  [ -f "$package_dir/nexus" ] || die "package is missing the nexus binary"

  cp "$package_dir/nexus" "$INSTALL_DIR/$APP_NAME"
  chmod +x "$INSTALL_DIR/$APP_NAME"

  if [ -f "$package_dir/icon.png" ]; then
    cp "$package_dir/icon.png" "$ICONS_DIR/nexus-terminal.png"
  fi

  cat > "$DESKTOP_DIR/nexus-terminal.desktop" <<EOF
[Desktop Entry]
Name=Nexus Terminal
GenericName=AI Agent Terminal
Comment=Multi-agent AI terminal workspace
Exec=${INSTALL_DIR}/${APP_NAME}
Icon=nexus-terminal
Type=Application
Categories=Development;TerminalEmulator;
Keywords=terminal;ai;agent;claude;codex;gemini;
StartupNotify=true
StartupWMClass=Nexus
EOF

  gtk-update-icon-cache -q -t "${XDG_DATA_HOME}/icons/hicolor" 2>/dev/null || true
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
}

path_hint() {
  case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *)
      echo
      warn "${INSTALL_DIR} is not in your PATH."
      echo "Add this to your shell profile:"
      echo
      echo '  export PATH="$HOME/.local/bin:$PATH"'
      echo
      ;;
  esac
}

[ "$(uname -s)" = "Linux" ] || die "install.sh only supports Linux. Use install.ps1 on Windows."

need_cmd tar
ARCH="$(detect_arch)"

echo
echo -e "${BOLD}${CYAN}Nexus Linux Installer${RESET}"
echo -e "Installing the ${BOLD}${ARCH}${RESET} release package only."
echo

install_binary "$ARCH"
path_hint

echo
success "Nexus installed to ${BOLD}${INSTALL_DIR}/${APP_NAME}${RESET}"
echo -e "Run with: ${BOLD}${CYAN}nexus${RESET}"
echo
