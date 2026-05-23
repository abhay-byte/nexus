#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BINARY="${PROJECT_ROOT}/src-tauri/target/release/nexus-headless"

if [ ! -f "${BINARY}" ]; then
    echo "Binary not found. Building first..."
    "${SCRIPT_DIR}/build-headless.sh"
fi

cd "${PROJECT_ROOT}"
echo "Launching nexus-headless (release)..."
echo "  HTTP:  http://127.0.0.1:${NEXUS_PORT:-7878}"
echo "  WS:    ws://127.0.0.1:${NEXUS_WS_PORT:-7879}"
echo ""
exec "${BINARY}"
