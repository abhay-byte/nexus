---
- id: T1
  title: Fix terminal/WebUI freeze when running CLI tools
  type: bug
  priority: high
  difficulty: medium
  frequency: always
  expected: Terminal runs CLI commands; webui stays interactive; output streams without blocking
  actual: Whole UI freezes while any CLI tool executes, including simple commands
  reproduction: |
    1. Open nexus webui/terminal
    2. Run any CLI command (e.g. ls, echo, npm install)
    3. UI becomes unresponsive until command completes
  impact: WebUI + terminal both freeze; blocks all interactive work while commands run
  images: null
  github_ref: null
  status: finished
  pr: https://github.com/abhay-byte/nexus/pull/1
  merged_into: v0.2.x
  merged_at_commit: ce1a1e5
  root_cause: |
    Three compounding bottlenecks:
    1. sessionStore.ts:196 — markSessionStatus("running") fires on EVERY PTY chunk
    2. TerminalView directWriter — term.write() runs synchronously on main thread
    3. pty.rs reader — emits one Tauri event per 8KB read
  plan: |
    - Fix 1: drop per-chunk markSessionStatus call
    - Fix 2: wrap directWriter writes in requestAnimationFrame
    - Fix 3: coalesce PTY reads in 16ms windows before emitting
- id: T2
  title: Terminal focus lost on project switch and first CLI tool run
  type: bug
  priority: critical
  difficulty: unknown
  frequency: always
  expected: Terminal auto-focuses when switching projects or when a CLI tool starts for the first time
  actual: |
    Two symptoms:
    1. Switching to a different project does not focus the terminal — user must click
    2. Running a CLI tool for the first time starts with terminal unfocused — user must click
  impact: Blocks interactive terminal work across projects; requires manual click every time
  images: null
  github_ref: null
  status: finished
  pr: https://github.com/abhay-byte/nexus/pull/3
  merged_into: v0.2.x
  plan: |
    Root cause: useEffect([active, isTabActive]) doesn't re-fire on project switch
    because isTabActive is per-project. Fix: thread isProjectActive from App.tsx
    through PaneGrid → Pane → TerminalView and add to focus useEffect deps.
    4 files changed, zero TS errors, user-approved.
---
