#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Building nexus-headless (release)..."
cd "${PROJECT_ROOT}/src-tauri"
cargo build --release --bin nexus-headless

echo ""
echo "Done! Binary: ${PROJECT_ROOT}/src-tauri/target/release/nexus-headless"
