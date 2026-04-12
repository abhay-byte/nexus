#!/usr/bin/env bash
set -euo pipefail

AI="codex"

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap-spec-kit.sh [--ai codex|claude|gemini] <project-path> [more-paths...]

Initializes GitHub Spec Kit in each target project with:
  uvx --from git+https://github.com/github/spec-kit.git specify init --here --ai <agent>

If .specify already exists in a project, that project is skipped.
EOF
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ai)
      AI="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

if ! command -v uvx >/dev/null 2>&1; then
  echo "uvx is required but was not found on PATH." >&2
  exit 1
fi

for project_path in "$@"; do
  if [[ ! -d "$project_path" ]]; then
    echo "skip: $project_path (not a directory)"
    continue
  fi

  if [[ -d "$project_path/.specify" ]]; then
    echo "skip: $project_path (.specify already exists)"
    continue
  fi

  echo "bootstrap: $project_path (ai=$AI)"
  (
    cd "$project_path"
    uvx --from git+https://github.com/github/spec-kit.git specify init --here --ai "$AI"
  )
done
