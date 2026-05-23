#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}/src-tauri"
echo "Launching nexus-headless (debug)..."
echo "  HTTP:  http://127.0.0.1:${NEXUS_PORT:-7878}"
echo "  WS:    ws://127.0.0.1:${NEXUS_WS_PORT:-7879}"
echo ""
exec cargo run --bin nexus-headless
