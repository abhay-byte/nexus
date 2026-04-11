#!/usr/bin/env bash
# Nexus Terminal — system-wide install script
# Usage: ./install.sh
# Builds a release binary, installs it to ~/.local/bin, and creates a symlink.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
APP_NAME="nexus"
BINARY="$SCRIPT_DIR/src-tauri/target/release/$APP_NAME"

echo "▶ Building Nexus Terminal (release)..."
cd "$SCRIPT_DIR"

# Ensure npm deps are installed
if [ ! -d node_modules ]; then
  echo "  → Installing npm dependencies..."
  npm install
fi

# Build Tauri release binary
npm run tauri build -- --bundles none 2>&1

if [ ! -f "$BINARY" ]; then
  echo "✗ Build failed — binary not found at $BINARY"
  exit 1
fi

echo "▶ Installing to $INSTALL_DIR/$APP_NAME..."
mkdir -p "$INSTALL_DIR"

# Copy binary
cp "$BINARY" "$INSTALL_DIR/$APP_NAME"
chmod +x "$INSTALL_DIR/$APP_NAME"

# Ensure ~/.local/bin is on PATH
if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
  echo ""
  echo "  ⚠ $INSTALL_DIR is not in PATH."
  echo "  Add this line to your ~/.bashrc or ~/.zshrc:"
  echo ""
  echo '    export PATH="$HOME/.local/bin:$PATH"'
  echo ""
fi

# Optional: create a desktop entry (Linux only)
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_SRC="$SCRIPT_DIR/src-tauri/icons/icon.png"
if [ -f "$ICON_SRC" ]; then
  mkdir -p "$DESKTOP_DIR"
  cat > "$DESKTOP_DIR/nexus-terminal.desktop" <<EOF
[Desktop Entry]
Name=Nexus Terminal
Comment=Multi-agent AI terminal workspace
Exec=$INSTALL_DIR/$APP_NAME
Icon=$HOME/.local/share/icons/nexus.png
Type=Application
Categories=Development;TerminalEmulator;
Keywords=terminal;ai;agent;claude;codex;
StartupNotify=true
EOF
  mkdir -p "$HOME/.local/share/icons"
  cp "$ICON_SRC" "$HOME/.local/share/icons/nexus.png"
  echo "  → Desktop entry created."
fi

echo ""
echo "✔ Nexus Terminal installed!"
echo "  Run with: $APP_NAME"
echo ""
