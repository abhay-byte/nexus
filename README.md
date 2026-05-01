# Nexus Terminal

<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="Nexus Logo">
</p>

<p align="center">
  <strong>Multi-agent AI terminal workspace</strong><br>
  Run Claude Code, Codex CLI, Gemini CLI, Qwen, Aider, and more — side-by-side.
</p>

<p align="center">
  <a href="https://github.com/abhay-byte/nexus/releases/latest"><img src="https://img.shields.io/github/v/release/abhay-byte/nexus?label=latest&color=ffcc00" alt="Release"></a>
  <img src="https://img.shields.io/github/license/abhay-byte/nexus?color=ffcc00" alt="License">
  <img src="https://img.shields.io/github/stars/abhay-byte/nexus?color=ffcc00" alt="Stars">
</p>

> **Dual Mode** — Use as a **desktop app** (Tauri) or run the **standalone web server** and access from any browser on your local network.

---

## Screenshots

| 1. Main Workspace | 2. Diff View | 3. Settings |
|:-:|:-:|:-:|
| ![1. Main Workspace](docs/screenshots/1.png) | ![2. Diff View](docs/screenshots/3.png) | ![3. Settings](docs/screenshots/5.png) |

---

## Features

### Multi-Agent Support
- **13+ AI coding agents** — Claude Code, Codex CLI, Gemini CLI, Aider, OpenCode, Qwen Code, Junie, Kiro, Kilo Code, Cline, Continue, Goose, Amp
- Auto-detected on PATH — only installed agents appear in the launcher
- Run multiple agents side-by-side in the same project

### Terminal Management
- **Terminal tabs per project** — each project has independent terminal tabs
- **Split panes** — split horizontally or vertically (up to 2×2)
- **Session persistence** — terminals survive app restarts; layout and sessions restored automatically
- **True-color PTY** — `xterm-256color` + `COLORTERM=truecolor` for proper TUI rendering
- **Batched terminal streaming** — noisy agents are buffered to prevent UI thrashing

### Project Organization
- **Kanban board** — built-in `◈ KANBAN` tab with Todo / In Progress / Done / Blocked columns
- Tasks persist across restarts
- Per-project settings and agent configurations

### Configuration & Workflow
- **Credential inheritance** — PTY spawner inherits full shell environment (API keys, PATH, etc.)
- **Shared MCP registry** — configure MCP once in Settings, sync across all projects
- **Workflow add-ons** — bootstrap Spec Kit, install `AGENCY.md` specialist, Caveman integration

### User Interface
- **Brutalist UI** — high-contrast dark mode, Space Grotesk typography
- **Yellow accent** (`#ffcc00`) with pixel-shadow components
- **Command palette** — quick access to all actions
- Native window decorations optional

---

## Desktop vs Web Server

Both modes share the same frontend and Rust backend. Choose what fits your workflow:

| Feature | Desktop App | Web Server |
|---------|------------|------------|
| **Terminal** | ✅ Native PTY | ✅ Via WebSocket |
| **Agent spawning** | ✅ Full | ✅ Full |
| **File tree** | ✅ Native FS | ✅ Via HTTP API |
| **Git diff/status** | ✅ Full | ✅ Full |
| **Kanban board** | ✅ Persisted to disk | ✅ Persisted to disk |
| **Project list** | ✅ Persisted to disk | ✅ Persisted to disk |
| **Resource monitor** | ✅ Full | ✅ Full |
| **Settings / MCP** | ✅ Full | ✅ Full |
| **Agency agents** | ✅ Full | ✅ Full |
| **Access from phone/tablet** | ❌ | ✅ Same WiFi |
| **Multiple users** | ❌ | ✅ Local network |

> **Note:** In web server mode, projects and kanban tasks are saved to `nexus_web_state.json` in the server's working directory. The desktop app uses Tauri's native file APIs. Data is not shared between the two modes unless you manually copy the state file.

---

## Install

Choose your mode:

### Option 1: Desktop App (Recommended)

> **[⬇ Download latest release](https://github.com/abhay-byte/nexus/releases/latest)**

#### Linux

**x64:**
```bash
tar -xzf Nexus_linux_x64.tar.gz
cp Nexus_linux_x64/nexus ~/.local/bin/nexus
chmod +x ~/.local/bin/nexus
nexus
```

**ARM64:**
```bash
tar -xzf Nexus_linux_arm64.tar.gz
cp Nexus_linux_arm64/nexus ~/.local/bin/nexus
chmod +x ~/.local/bin/nexus
nexus
```

Or use the installer script:
```bash
./install.sh  # Auto-detects architecture
```

#### Windows

Download `Nexus_windows_x64.zip` or `Nexus_windows_arm64.zip`, extract, and run `nexus.exe`.

Or use PowerShell:
```powershell
./install.ps1  # Auto-detects architecture
```

---

### Option 2: Web Server (Browser Mode)

Run the standalone HTTP + WebSocket server and access from any browser on your local network.

#### Build from source

```bash
git clone https://github.com/abhay-byte/nexus.git
cd nexus
npm install
npm run build
cd src-tauri
cargo build --bin nexus-server --release
```

#### Run the server

```bash
./target/release/nexus-server
```

- **HTTP API:** `http://localhost:7878`
- **WebSocket:** `ws://localhost:7879/ws`
- **Open in browser:** `http://localhost:7878`

#### Security

The server only accepts connections from **localhost and your local network IPs**. External requests are blocked with `403 Forbidden`. You can allow extra IPs:

```bash
NEXUS_ALLOW_IPS=192.168.1.50 ./target/release/nexus-server
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXUS_PORT` | `7878` | HTTP server port |
| `NEXUS_WS_PORT` | `7879` | WebSocket server port |
| `NEXUS_ALLOW_IPS` | — | Comma-separated extra allowed IPs |

---

## Dev Setup

```bash
git clone https://github.com/abhay-byte/nexus.git
cd nexus
npm install
npm run tauri dev
```

For ARM64 cross-compilation, see [docs/building-arm64.md](docs/building-arm64.md).

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+T` | Vertical split (new pane) |
| `Ctrl+Shift+W` | Kill focused session |
| `Ctrl+Tab` | Next project |
| `Ctrl+Shift+Tab` | Previous project |
| `Ctrl+Q` | Quit |

---

## Supported Agents

| Agent | Command | Notes |
|---|---|---|
| Claude Code | `claude` | `--dangerously-skip-permissions` flag auto-added |
| Codex CLI | `codex` | |
| Gemini CLI | `gemini` | |
| Aider | `aider` | |
| OpenCode | `opencode` | |
| Qwen Code | `qwen` | |
| Junie | `junie` | JetBrains |
| Kiro | `kiro` | |
| Kilo Code | `kilo-code` | |
| Cline | `cline` | |
| Continue | `continue` | |
| Goose | `goose` | Block |
| Amp | `amp` | |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop shell | [Tauri v2](https://tauri.app) (Rust) — optional |
| Frontend | React 18 + TypeScript + Vite |
| State | Zustand |
| Terminal | xterm.js via `@xterm/xterm` |
| PTY backend | `portable-pty` (Rust) |
| HTTP server | `tiny_http` (Rust) |
| WebSocket | `tokio-tungstenite` (Rust) |
| Styling | Tailwind CSS + custom brutalist tokens |

---

## Project Structure

```
nexus/
├── src/                    # React frontend (works in both modes)
│   ├── components/         # UI components
│   │   ├── AgentBar/       # Running session tabs + launch dropdown
│   │   ├── Kanban/         # Per-project Kanban board
│   │   ├── PaneGrid/       # Split terminal grid
│   │   ├── TerminalTabBar/ # Terminal tab navigation
│   │   └── Titlebar/       # Window chrome
│   ├── store/              # Zustand stores
│   ├── lib/
│   │   ├── api.ts          # Unified Tauri / HTTP / WebSocket API
│   │   └── persistence.ts  # Project & session persistence
│   └── types/              # TypeScript types
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Library exports (pty, server, ws)
│   │   ├── main.rs         # Tauri desktop entry point
│   │   ├── bin/
│   │   │   └── server.rs   # Standalone server entry point
│   │   ├── server.rs       # HTTP REST API + static file serving
│   │   ├── ws_server.rs    # WebSocket terminal streaming
│   │   └── pty.rs          # PTY spawn / resize / kill
│   └── capabilities/       # Tauri permissions
├── docs/                   # Documentation
└── install.sh              # System-wide installer
```

---

## License

MIT © 2026 Abhay
