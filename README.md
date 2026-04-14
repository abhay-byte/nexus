# Nexus Terminal

> **Multi-agent AI terminal workspace** — run Claude Code, Codex CLI, Gemini CLI, Qwen, Aider, and more, side-by-side in a brutalist desktop app.

![Main Workspace](docs/screenshots/main_workspace.png)

---

## Features

- **13+ AI coding agents** — Claude Code, Codex CLI, Gemini CLI, Aider, OpenCode, Qwen Code, Junie, Kiro, Kilo Code, Cline, Continue, Goose, Amp — auto-detected on PATH
- **Terminal tabs per project** — each project has independent terminal tabs; the `+` button opens a new tab
- **Split panes** — split horizontally or vertically (up to 2×2); the split button toggles 1→2→1
- **Kanban board** — every project gets a built-in `◈ KANBAN` tab with Todo / In Progress / Done / Blocked columns; tasks persist across restarts
- **Session persistence** — terminals survive app restarts; layout and sessions are restored automatically
- **Batched terminal streaming** — noisy agents like Codex are buffered before UI updates so long runs do not thrash the webview
- **True-color PTY** — `xterm-256color` + `COLORTERM=truecolor` injected; TUI tools (Codex, lazygit, etc.) render correctly  
- **Credential inheritance** — PTY spawner inherits your full shell environment (API keys, PATH, etc.) so agents are already logged in
- **Shared MCP registry** — configure MCP once in `Settings -> Agents & MCP`, then let Nexus inject or sync it across every registered project
- **Workflow add-ons** — bootstrap Spec Kit into real `.specify/` project files, install a project-level `AGENCY.md` specialist, and install Caveman for supported agents from settings with persisted install state across restarts
- **Brutalist UI** — high-contrast dark mode, Space Grotesk typography, yellow accent (`#ffcc00`), pixel-shadow components

---

## Screenshots

| Main Workspace | Add Project |
|:-:|:-:|
| ![Main Workspace](docs/screenshots/main_workspace.png) | ![Add Project Dialog](docs/screenshots/add_project_dialog.png) |

| Add Agent | Settings |
|:-:|:-:|
| ![Add Agent](docs/screenshots/add_agent_view.png) | ![Settings](docs/screenshots/settings_panel.png) |

| Command Palette | Project Settings |
|:-:|:-:|
| ![Command Palette](docs/screenshots/command_palette.png) | ![Project Settings](docs/screenshots/project_settings.png) |

---

## Install

> **[⬇ Download latest release](https://github.com/abhay-byte/nexus/releases/latest)**

Installation is package-only now. The release contains exactly four archives:

- `Nexus_linux_x64.tar.gz`
- `Nexus_linux_arm64.tar.gz`
- `Nexus_windows_x64.zip`
- `Nexus_windows_arm64.zip`

---

### 🐧 Linux — x64

Run the installer script:

```bash
./install.sh
```

Or install manually from the release package:

```bash
tar -xzf Nexus_linux_x64.tar.gz
cp Nexus_linux_x64/nexus ~/.local/bin/nexus
chmod +x ~/.local/bin/nexus
nexus
```

---

### 🐧 Linux — ARM64

`install.sh` auto-detects `arm64` and downloads `Nexus_linux_arm64.tar.gz`.

Manual install:

```bash
tar -xzf Nexus_linux_arm64.tar.gz
cp Nexus_linux_arm64/nexus ~/.local/bin/nexus
chmod +x ~/.local/bin/nexus
nexus
```

---

### 🪟 Windows — x64

Run the installer script:

```powershell
./install.ps1
```

Or download `Nexus_windows_x64.zip`, extract it, and run `nexus.exe`.

---

### 🪟 Windows — ARM64

`install.ps1` auto-detects `arm64` and downloads `Nexus_windows_arm64.zip`.

Or download `Nexus_windows_arm64.zip`, extract it, and run `nexus.exe`.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop shell | [Tauri v2](https://tauri.app) (Rust) |
| Frontend | React 18 + TypeScript + Vite |
| State | Zustand |
| Terminal | xterm.js via `@xterm/xterm` |
| PTY backend | `portable-pty` (Rust) |
| Styling | Tailwind CSS (utility-only) + custom brutalist tokens |

---

## Dev Setup

```bash
git clone https://github.com/abhay-byte/nexus.git
cd nexus
npm install
./run.sh          # sources your shell profile then starts dev server
# OR
npm run tauri dev
```

MCP setup details and preset behavior are documented in [docs/agent-mcp-skills-guide.md](docs/agent-mcp-skills-guide.md).

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

Only installed agents (detected via `which`) are shown as enabled in the launcher.

---

## Project Structure

```
nexus/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── AgentBar/       # Running session tabs + launch dropdown
│   │   ├── Kanban/         # Per-project Kanban board
│   │   ├── PaneGrid/       # Split terminal grid
│   │   ├── TerminalTabBar/ # Terminal tab navigation
│   │   └── Titlebar/       # Window chrome
│   ├── store/
│   │   ├── kanbanStore.ts  # Kanban tasks (persisted to localStorage)
│   │   ├── projectStore.ts # Projects (persisted to disk)
│   │   └── sessionStore.ts # Sessions, layouts, tabs (persisted to disk)
│   └── types/              # Shared TypeScript types
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Tauri commands
│   │   └── pty.rs          # PTY spawn / resize / kill
│   └── capabilities/       # Tauri permission config
├── docs/screenshots/       # README screenshots
├── install.sh              # System-wide install (one command, zero deps)
└── run.sh                  # Dev launcher (sources shell profile)
```

---

## License

MIT © 2025 Abhay
