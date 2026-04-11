# NEXUS — Multi-Project AI Agent Terminal Workspace
## Complete Build Specification for Coding Agent

---

## Overview

Build **Nexus**, a cross-platform desktop application (Rust + Tauri v2 + React + TypeScript)
that lets a developer open multiple projects simultaneously, and within each project run
multiple CLI AI agents (Claude Code, Codex CLI, Gemini CLI, Aider, OpenCode, etc.) in
isolated, real PTY terminal panes — all in one unified GUI window.

Think of it as: **tmux meets a project manager meets an AI agent launcher**, with a clean
modern GUI instead of raw terminal multiplexing.

---

## Target User

A solo developer (Linux/macOS/Windows) working across 3-6 different projects at once, each
with different tech stacks, using different CLI AI agents per project or per task. They want
to switch between projects instantly, see all running agents at a glance, and never lose a
session.

---

## Tech Stack

### Desktop Shell
- **Tauri v2** (Rust backend + WebView2/WebKit frontend)
- Rust stable, edition 2021
- `tauri` 2.x with `tauri-plugin-shell` and `tauri-plugin-fs`

### Terminal Emulation (Rust side)
- `portable-pty` crate — spawn real PTY processes per pane
- Each agent gets its own PTY master/slave pair
- PTY output streamed to frontend via Tauri `emit()` events
- PTY input sent from frontend via Tauri `invoke()` commands

### Frontend
- React 18 + TypeScript + Vite
- `xterm.js` v5 + `@xterm/addon-fit` + `@xterm/addon-web-links` — render each PTY in a real
  terminal emulator inside the browser
- Zustand — global state (projects, sessions, layout)
- CSS custom properties only — no Tailwind, no styled-components
- No external UI component libraries — build everything from scratch

### Persistence
- `serde` + `serde_json` — serialize app state
- Config stored at `~/.config/nexus/` (Linux/macOS) or `%APPDATA%\nexus\` (Windows)
- `projects.json` — project list, paths, colors, agent configs
- `sessions.json` — active session IDs, layout snapshots per project
- SQLite via `rusqlite` (optional, only if session history grows complex)

### Build
- `cargo tauri build` for production
- `cargo tauri dev` for development
- `vite` for frontend hot-reload during dev

---

## File Structure

```
nexus/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs              # Tauri app entry, window setup
│       ├── pty.rs               # PTY spawn, read loop, write
│       ├── session.rs           # Session struct, lifecycle
│       ├── project.rs           # Project struct, config I/O
│       ├── state.rs             # AppState (Arc<Mutex<...>>)
│       └── commands/
│           ├── mod.rs
│           ├── pty_commands.rs  # spawn_pty, write_pty, kill_pty, resize_pty
│           ├── project_commands.rs  # add_project, list_projects, remove_project
│           └── session_commands.rs  # create_session, list_sessions, close_session
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── store/
│   │   ├── projectStore.ts      # Zustand: projects list
│   │   └── sessionStore.ts     # Zustand: sessions, active panes
│   ├── components/
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx      # Project list panel
│   │   │   └── ProjectItem.tsx
│   │   ├── Titlebar/
│   │   │   └── Titlebar.tsx     # Custom drag region + app controls
│   │   ├── ProjectTabs/
│   │   │   └── ProjectTabs.tsx  # Open project tab strip
│   │   ├── AgentBar/
│   │   │   └── AgentBar.tsx     # Agent pills for current project
│   │   ├── PaneGrid/
│   │   │   ├── PaneGrid.tsx     # Split layout container
│   │   │   ├── Pane.tsx         # Single pane: header + xterm
│   │   │   └── TerminalView.tsx # xterm.js wrapper component
│   │   └── StatusBar/
│   │       └── StatusBar.tsx
│   ├── hooks/
│   │   ├── usePty.ts            # PTY lifecycle hook
│   │   └── useResizeObserver.ts
│   ├── types/
│   │   └── index.ts             # Project, Session, Agent, Pane types
│   ├── styles/
│   │   ├── global.css
│   │   └── tokens.css           # CSS custom properties
│   └── utils/
│       ├── agents.ts            # Known agent CLI configs
│       └── colors.ts            # Project accent colors
├── package.json
└── vite.config.ts
```

---

## Core Data Types

### TypeScript (frontend)

```typescript
// types/index.ts

export type AgentId = 'claude-code' | 'codex' | 'gemini-cli' | 'aider' | 'opencode' | 'goose' | 'amp' | string;

export interface AgentConfig {
  id: AgentId;
  name: string;               // "Claude Code"
  command: string;            // "claude"
  args?: string[];            // e.g. ["--dangerously-skip-permissions"]
  env?: Record<string,string>;
  color: string;              // accent hex
  statusColor: string;
}

export interface Project {
  id: string;                 // nanoid
  name: string;
  path: string;               // absolute filesystem path
  color: string;              // accent color hex
  defaultAgents: AgentId[];   // agents to auto-spawn when project opens
  createdAt: number;
}

export interface Session {
  id: string;                 // nanoid
  projectId: string;
  agentId: AgentId;
  ptyId: string;              // maps to Rust-side PTY process
  status: 'running' | 'idle' | 'exited';
  title: string;              // e.g. "Claude Code — ~/Truvalt"
  cwd: string;
}

export interface Pane {
  id: string;
  sessionId: string | null;   // null = empty pane waiting for agent
  row: number;
  col: number;
}

export interface ProjectLayout {
  projectId: string;
  rows: number;               // grid rows (1 or 2)
  cols: number;               // grid cols (1 or 2)
  panes: Pane[];
}
```

### Rust (backend)

```rust
// session.rs
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct PtySession {
    pub id: String,
    pub project_id: String,
    pub agent_id: String,
    pub cwd: String,
    pub pid: u32,
    pub status: SessionStatus,
}

#[derive(Clone, Serialize, Deserialize)]
pub enum SessionStatus {
    Running,
    Idle,
    Exited(i32),
}
```

---

## Feature Specifications

### 1. Project Management

**Add Project:**
- Click `+ add project` in sidebar → opens a dialog:
  - Name (text input, auto-filled from folder name)
  - Path (file picker via `tauri-plugin-dialog`)
  - Accent color (6 preset swatches)
  - Default agents (checkboxes: Claude Code, Codex, Gemini CLI, Aider, OpenCode)
- On confirm: save to `projects.json`, append to sidebar, open in a new project tab

**Project Sidebar:**
- Shows all saved projects as a scrollable list
- Each item: colored dot + project name + agent count badge
- Click → switch active project tab (or open if not already open)
- Right-click → context menu: Open Folder, Remove Project, Settings
- Active project highlighted with left accent border (project color)

**Project Tabs:**
- Strip at top of workspace area
- Each tab: colored dot + project name + close button
- Max ~8 tabs before scrolling
- Click `+` → same dialog as sidebar add
- Close tab → kills all PTY sessions for that project, removes from tab strip
- Projects survive tab close (they remain in sidebar)

---

### 2. Agent Bar

Shown below the project tabs, specific to the currently focused project.

- Pill buttons for each agent: colored status dot + agent name
- Status dot: green pulse = running, amber = idle/waiting, gray = not started
- Click pill to focus that agent's pane (if open)
- `+ agent` pill opens agent picker dropdown:
  - Lists all known agents detected on the system (check PATH)
  - Also shows custom agents from user config
  - Selecting spawns a new PTY session in a new/empty pane
- Right side: `⊟ split H` and `⊞ split V` buttons to add pane rows/cols
- Agent pills auto-detect which agents are installed via Rust-side PATH check on startup

---

### 3. PTY Pane Grid

**Layout:**
- Grid of panes: default 1×1, user can split to 1×2, 2×1, 2×2 (max)
- Each pane = pane header + xterm.js terminal
- Pane header: agent badge (colored) + project cwd + kill button (✕)
- Dividers between panes are draggable (resizable via CSS grid or manual pixel tracking)
- Empty pane shows: agent picker centered (which agent to run here?)

**Pane Header:**
- Agent badge: pill with agent name, color-coded background
- Current working directory (shortened to `~/path/relative`)
- Agent status indicator (small colored dot)
- Kill button (✕) — sends SIGTERM to PTY process
- Restart button (↺) — kills then respawns same agent in same pane

**Terminal (xterm.js):**
- Real PTY: spawned on Rust side, I/O bridged via Tauri events
- Theme matches app (dark/light) — use xterm themes that match CSS vars
- Font: `JetBrains Mono`, `Fira Code`, or `monospace` system fallback, 13px
- Copy on select, paste on right-click or Ctrl+Shift+V
- Scrollback: 10,000 lines
- Fit addon: auto-resizes pty cols/rows when pane resizes

**Key bindings in terminal:**
- All standard terminal keys pass through to the PTY
- `Ctrl+Shift+C` — copy selection
- `Ctrl+Shift+V` — paste
- App-level: `Ctrl+Shift+T` — new pane, `Ctrl+Shift+W` — close pane
- `Ctrl+Tab` / `Ctrl+Shift+Tab` — cycle project tabs

---

### 4. PTY Lifecycle (Rust Backend)

**`spawn_pty` command:**
```rust
// Called from frontend when user launches an agent
#[tauri::command]
async fn spawn_pty(
    session_id: String,
    command: String,       // e.g. "claude"
    args: Vec<String>,     // e.g. ["--dangerously-skip-permissions"]
    cwd: String,           // project path
    env: HashMap<String,String>,
    cols: u16,
    rows: u16,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String>
```

- Use `portable_pty::native_pty_system()` to open a PTY pair
- Spawn the agent process with correct cwd, env, cols/rows
- Launch a background thread that reads PTY master output in a loop
- Emit `pty-output:{session_id}` events to frontend with chunks of `Vec<u8>` (raw bytes)
- Store session in `AppState`
- Return `session_id` on success

**`write_pty` command:**
```rust
#[tauri::command]
fn write_pty(session_id: String, data: Vec<u8>, state: ...) -> Result<(), String>
```
Writes raw bytes from xterm to the PTY master.

**`resize_pty` command:**
```rust
#[tauri::command]
fn resize_pty(session_id: String, cols: u16, rows: u16, state: ...) -> Result<(), String>
```
Calls `pty.resize(PtySize { rows, cols, ... })`.

**`kill_pty` command:**
Sends SIGTERM (Unix) or TerminateProcess (Windows) to the child process. Cleans up from `AppState`.

**Output streaming:**
Frontend listens: `await listen('pty-output:' + sessionId, (e) => term.write(e.payload))`.
Use `Uint8Array` for raw bytes so xterm handles escape codes natively.

---

### 5. Known Agent Configs

```typescript
// utils/agents.ts
export const KNOWN_AGENTS: AgentConfig[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    args: [],
    color: '#534AB7',
    statusColor: '#AFA9EC',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    command: 'codex',
    args: [],
    color: '#1a7f37',
    statusColor: '#61C554',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    command: 'gemini',
    args: [],
    color: '#1967d2',
    statusColor: '#85B7EB',
  },
  {
    id: 'aider',
    name: 'Aider',
    command: 'aider',
    args: ['--no-auto-commits'],
    color: '#9e4c0a',
    statusColor: '#EF9F27',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    args: [],
    color: '#6b21a8',
    statusColor: '#d8b4fe',
  },
  {
    id: 'goose',
    name: 'Goose',
    command: 'goose',
    args: [],
    color: '#0f766e',
    statusColor: '#5eead4',
  },
  {
    id: 'amp',
    name: 'Amp',
    command: 'amp',
    args: [],
    color: '#7c3aed',
    statusColor: '#c4b5fd',
  },
];
```

On startup, Rust-side checks which of these are in PATH:
```rust
#[tauri::command]
fn detect_installed_agents() -> Vec<String> {
    KNOWN_AGENT_COMMANDS
        .iter()
        .filter(|cmd| which::which(cmd).is_ok())
        .map(|s| s.to_string())
        .collect()
}
```
Use the `which` crate.

---

### 6. App Layout & UI

#### Window
- Custom titlebar (`decorations: false` in tauri.conf.json)
- Drag region: entire titlebar div except buttons
- macOS: use `data-tauri-drag-region` on the titlebar
- Min size: 900×600, default: 1280×720

#### Color Tokens (CSS)
```css
:root {
  --bg-primary: #1a1a1f;
  --bg-secondary: #141418;
  --bg-tertiary: #111115;
  --border: rgba(255,255,255,0.08);
  --border-hover: rgba(255,255,255,0.15);
  --text-primary: #e8e6f0;
  --text-secondary: #9b99aa;
  --text-tertiary: #5c5a6a;
  --accent: #534AB7;
  --accent-dim: #3C3489;
  --font-ui: system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --sidebar-width: 180px;
  --titlebar-height: 38px;
  --agent-bar-height: 40px;
  --status-bar-height: 24px;
}
```

Dark mode only for v1. Light mode is a stretch goal.

#### Layout Grid
```
┌─────────── Titlebar (38px) ───────────────┐
│ Sidebar │ ProjectTabs + AgentBar + PaneGrid │
│(180px)  │ (flex-1)                         │
└─────────── StatusBar (24px) ──────────────┘
```

Use CSS Grid for the outer shell:
```css
.app-shell {
  display: grid;
  grid-template-rows: var(--titlebar-height) 1fr var(--status-bar-height);
  grid-template-columns: var(--sidebar-width) 1fr;
  height: 100vh;
  overflow: hidden;
}
.titlebar { grid-column: 1 / -1; }
.statusbar { grid-column: 1 / -1; }
```

---

### 7. Session Persistence

On app quit: serialize all open sessions + layouts to `sessions.json`.
On app start: restore sessions → attempt to re-spawn PTY processes that were running.

`sessions.json` structure:
```json
{
  "version": 1,
  "openProjects": ["proj-id-1", "proj-id-2"],
  "activeProjectId": "proj-id-1",
  "layouts": {
    "proj-id-1": {
      "rows": 1, "cols": 2,
      "panes": [
        { "id": "pane-1", "sessionId": "sess-1", "row": 0, "col": 0 },
        { "id": "pane-2", "sessionId": "sess-2", "row": 0, "col": 1 }
      ]
    }
  },
  "sessions": [
    { "id": "sess-1", "projectId": "proj-id-1", "agentId": "claude-code", "cwd": "/home/user/truvalt" },
    { "id": "sess-2", "projectId": "proj-id-1", "agentId": "codex", "cwd": "/home/user/truvalt/backend" }
  ]
}
```

---

### 8. Status Bar

- Left: "N agents running" (count of all running PTY sessions)
- Middle: current project name + path
- Right: shell detected (zsh/fish/bash) + OS name
- Background: use current project's accent color at 80% opacity

---

### 9. Add Agent Dialog

When user clicks `+ agent` in the agent bar:
- Dropdown/popover appears
- Lists installed agents (from detect_installed_agents) with colored icons
- Lists custom agents from user config
- `+ Custom agent...` option → opens a form:
  - Command (text, e.g. "myagent")
  - Args (text, comma-separated)
  - Working directory override (optional, defaults to project path)
  - Display name
  - Accent color picker
- Selecting an agent → spawns PTY in the next empty pane (or creates a new pane)

---

### 10. Settings Screen

Accessible from titlebar ⚙ button. A slide-over panel (not a new window):
- **Appearance:** font family picker (JetBrains Mono / Fira Code / Cascadia Code / system mono), font size slider (11–16px)
- **Terminal:** scrollback line count, cursor style (block/bar/underline), cursor blink toggle
- **Agents:** default args per agent (e.g. add `--dangerously-skip-permissions` to Claude Code)
- **Shell:** default shell for PTY (auto-detect or override path)
- **Session restore:** toggle session restoration on startup
- **Keybindings:** show reference table (not editable in v1)

---

## Implementation Order

Implement in this exact order — each step produces a working milestone:

### Step 1 — Tauri scaffold + custom titlebar
- `cargo create-tauri-app nexus` with React + TypeScript template
- Set `decorations: false`, define window min/default size
- Implement custom titlebar with drag region, traffic lights (macOS), minimize/maximize/close buttons (Windows/Linux)
- Basic dark theme CSS tokens applied

### Step 2 — Project CRUD + sidebar
- `Project` type, `projects.json` read/write
- Sidebar component: project list, add/remove
- File picker dialog for project path
- No terminal yet — clicking a project just shows its name in the workspace

### Step 3 — PTY backend (Rust)
- Add `portable-pty` to Cargo.toml
- Implement `spawn_pty`, `write_pty`, `kill_pty`, `resize_pty` commands
- Spawn a plain `bash` (or user shell) PTY and stream output to frontend
- No agent logic yet — prove the PTY bridge works

### Step 4 — xterm.js integration
- Install `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`
- `TerminalView` component: create xterm instance, listen for `pty-output:id`, write to xterm
- Send xterm `onData` → `write_pty` invoke
- Handle resize: ResizeObserver on pane div → `resize_pty` + `term.fit()`
- Prove: open one bash session, type commands, see output

### Step 5 — Agent launch + agent bar
- `detect_installed_agents` Rust command
- `KNOWN_AGENTS` config in frontend
- Agent bar pills with status dots
- Clicking an agent pill → `spawn_pty` with that agent's command + args + project cwd
- One pane per agent (1×N layout initially)

### Step 6 — Pane grid + splitting
- `PaneGrid` with CSS grid layout
- Split H / Split V buttons → add column or row to grid
- New pane starts empty, shows agent picker
- Draggable dividers (simple CSS or a small drag handler)

### Step 7 — Project tabs + multi-project
- Project tab strip above the agent bar
- Switching tabs preserves each project's pane layout and sessions
- Zustand store with per-project layout slices

### Step 8 — Session persistence
- On `tauri://close-requested` → serialize state to `sessions.json`
- On startup → read `sessions.json`, restore open projects + tabs
- Re-spawn PTY sessions that were running (attempt; skip gracefully if agent not found)

### Step 9 — Status bar + settings
- Status bar with agent count, project name, shell info
- Settings slide-over with font/terminal/agent options

### Step 10 — Polish
- Smooth tab switching transitions
- Pane flash when agent produces output (subtle border pulse)
- Notification: badge on project tab when a backgrounded agent needs input
- App icon (simple terminal + sparkle SVG → convert to .icns/.ico)
- README with install instructions for Linux/macOS

---

## Cargo.toml dependencies

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
portable-pty = "0.8"
which = "6"
nanoid = "0.4"
tokio = { version = "1", features = ["full"] }
```

## package.json dependencies

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-shell": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@xterm/xterm": "^5",
    "@xterm/addon-fit": "^0.10",
    "@xterm/addon-web-links": "^0.11",
    "zustand": "^4",
    "nanoid": "^5",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5",
    "vite": "^5",
    "@vitejs/plugin-react": "^4"
  }
}
```

---

## Constraints & Rules

- No Electron — Tauri only
- No CSS frameworks (no Tailwind, no MUI, no Chakra) — raw CSS with tokens
- No external component libraries — build everything
- No localStorage — all persistence goes through Tauri file system commands
- All PTY I/O must go through Rust — no Node.js child_process, no shell escape in JS
- The app must work on Linux (target: CachyOS / Arch), macOS, and Windows
- Sessions must survive app restart — persistence is mandatory, not optional
- No hardcoded paths — use `tauri::api::path::app_config_dir()` for config location

---

## Stretch Goals (after v1 is working)

- Light mode theme toggle
- Per-pane zoom (Ctrl+scroll)
- Global search across all terminal scrollback (`fzf`-style)
- Agent output notifications (system tray badge when backgrounded agent needs input)
- MCP server integration display (show active MCP connections per Claude Code session)
- Export session log to file
- SSH remote project support (project path = `user@host:/path`, PTY over SSH)
- AUR package / `.deb` / `.dmg` installers via GitHub Actions + `tauri-action`

---

## Start Here

Run this to scaffold:
```bash
cargo install create-tauri-app
cargo create-tauri-app nexus --template react-ts
cd nexus
cargo tauri dev
```

Then implement Step 1 through Step 10 in order. Each step should compile and run before
proceeding to the next.
