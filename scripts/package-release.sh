#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <x64|arm64> <binary-path>" >&2
  exit 1
fi

ARCH="$1"
BINARY_PATH="$2"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/dist/release"
PACKAGE_NAME="Nexus_linux_${ARCH}"
STAGING_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

[ -f "$ROOT_DIR/$BINARY_PATH" ] || {
  echo "binary not found: $BINARY_PATH" >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR" "$STAGING_DIR/$PACKAGE_NAME"

cp "$ROOT_DIR/$BINARY_PATH" "$STAGING_DIR/$PACKAGE_NAME/nexus"
cp "$ROOT_DIR/src-tauri/icons/icon.png" "$STAGING_DIR/$PACKAGE_NAME/icon.png"

cat > "$STAGING_DIR/$PACKAGE_NAME/nexus-terminal.desktop" <<'EOF'
[Desktop Entry]
Name=Nexus Terminal
GenericName=AI Agent Terminal
Comment=Multi-agent AI terminal workspace
Exec=nexus
Icon=nexus-terminal
Type=Application
Categories=Development;TerminalEmulator;
Keywords=terminal;ai;agent;claude;codex;gemini;
StartupNotify=true
StartupWMClass=Nexus
EOF

chmod +x "$STAGING_DIR/$PACKAGE_NAME/nexus"
tar -C "$STAGING_DIR" -czf "$OUTPUT_DIR/${PACKAGE_NAME}.tar.gz" "$PACKAGE_NAME"
echo "created $OUTPUT_DIR/${PACKAGE_NAME}.tar.gz"
