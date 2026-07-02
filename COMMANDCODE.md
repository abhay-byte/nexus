# Nexus

Tauri v2 desktop app for managing AI coding agents. Built with React + TypeScript frontend, Rust backend.

## Key Paths
- Frontend: `src/` (React/TS)
- Backend: `src-tauri/` (Rust)
- Build: Vite + Tauri CLI
- Package manager: npm

## Memory System
Agent memory is provided by **agentmemory** (`@agentmemory/agentmemory`). 

To use agentmemory, start the server first in a separate terminal:
```bash
npx @agentmemory/agentmemory
```

Then connect it to command-code:
```bash
agentmemory connect command-code
```

The agentmemory MCP server is already configured at `http://localhost:3111/mcp`.
