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
- **Workflow add-ons** — bootstrap Spec Kit into real `.specify/` project files, install a project-level `AGENCY.md` specialist, and install Caveman for supported agents from settings
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

Pre-built packages are available for all platforms — no build toolchain required.

---

### 🐧 Linux — x86_64

**Option A — AppImage** (any distro, portable):

```bash
chmod +x Nexus_0.1.1_amd64.AppImage
./Nexus_0.1.1_amd64.AppImage
```

> Move it to `~/.local/bin/nexus` so you can run `nexus` from anywhere.

**Option B — .deb** (Debian / Ubuntu / Mint):

```bash
sudo dpkg -i Nexus_0.1.1_amd64.deb
nexus
```

---

### 🐧 Linux — ARM64

**Option A — AppImage** (any distro, portable):

```bash
chmod +x Nexus_0.1.1_aarch64.AppImage
./Nexus_0.1.1_aarch64.AppImage
```

**Option B — .deb** (Debian / Ubuntu / Mint ARM):

```bash
sudo dpkg -i Nexus_0.1.1_aarch64.deb
nexus
```

---

### 🪟 Windows — x86_64

Download `Nexus_0.1.1_x64-setup.exe` or `Nexus_0.1.1_x64_en-US.msi` and run the installer. Nexus will appear in the Start menu.

---

### 🪟 Windows — ARM64

Download `Nexus_0.1.1_arm64-setup.exe` or `Nexus_0.1.1_arm64_en-US.msi` and run the installer.

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
