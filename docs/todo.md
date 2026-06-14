# Nexus Server Features TODO

## Feature 1: IP-Based Access Control ✅ COMPLETE
- [x] Server binds to `0.0.0.0` for LAN accessibility
- [x] Allow connections from `127.0.0.1` and `::1` (localhost)
- [x] Allow connections from server's local IP address
- [x] Allow connections from all network interface IPs
- [x] Block all external/non-local requests with **403 Forbidden**
- [x] Log blocked requests for security visibility
- [x] Clean build — **zero compiler warnings**
- [x] Custom extra IPs via `NEXUS_ALLOW_IPS` env var (comma-separated)

### How it works
When the Tauri app starts, an HTTP server spins up on port `7878` (or `NEXUS_PORT`). Every incoming request is checked against an allowlist:
1. **Localhost** — `127.0.0.1`, `::1`
2. **Auto-detected** — All local network IPs (WiFi, Ethernet, VPN, etc.)
3. **User-defined** — Extra IPs from `NEXUS_ALLOW_IPS` env var

If the client's IP is **not** in the list → instant `403 Forbidden`, no data served.

### Env vars
| Variable | Default | Description |
|----------|---------|-------------|
| `NEXUS_PORT` | `7878` | HTTP server port |
| `NEXUS_ALLOW_IPS` | (none) | Comma-separated extra allowed IPs |

### Files changed
- `src-tauri/src/server.rs` — IP filtering, static file serving, REST API
- `src-tauri/src/main.rs` — HTTP server startup in background thread
- `src-tauri/Cargo.toml` — Added `tiny_http`, `local-ip-address`, `mime_guess`
- `src/lib/api.ts` — Browser-mode API client (`isTauri()`, `httpApi`, `TerminalSocket`)
- `src/lib/persistence.ts` — Browser-mode project sync
- `src/store/kanbanStore.ts` — Browser-mode kanban sync

---

## Feature 2: [PENDING — Need clarification from user]
> You mentioned a second feature but didn't specify it. Options:
> 1. **WebSocket Terminal Support** — Browser-based PTY via `/ws/{session_id}` (frontend `api.ts` already has `TerminalSocket`)
> 2. **Auth / Token Protection** — Require a secret token for browser-mode API access
> 3. **HTTPS / TLS** — Secure the HTTP server with self-signed certificates
> 4. **Other** — Please specify

## Future Hardening (Optional)
- [ ] Restrict CORS from `*` to specific allowed origins
- [ ] Add rate limiting for API endpoints
- [ ] Add request logging middleware

---

## Tracked Items (todo-triage schema)

```yaml
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
  followups: T2 (terminal focus)
  root_cause: |
    Three compounding bottlenecks:
    1. sessionStore.ts:196 — markSessionStatus("running") fires on EVERY PTY chunk,
       creating a new sessions object that invalidates App.tsx + PaneGrid.tsx
       (both subscribe to state.sessions) and forces a full re-render of the
       844-line App + N panes per chunk.
    2. TerminalView directWriter — term.write() runs synchronously on the main
       thread for every chunk; large ANSI payloads block input handling.
    3. pty.rs reader — emits one Tauri event per 8KB read; Tauri event system
       overhead is high, flooding the main thread.
  plan: |
    - Fix 1 (frontend, lowest risk): drop per-chunk markSessionStatus call;
      status is already "running" from launch path. Keep noteSessionActivity
      since it early-returns unchanged state.
    - Fix 2 (frontend, low risk): wrap directWriter writes in requestAnimationFrame
      so xterm batches per-frame, freeing main thread between paints.
    - Fix 3 (backend, medium risk): coalesce PTY reads in 16ms windows before
      emitting; reduces emit count 10-50x for high-throughput commands.
---
- id: T2
  title: Terminal focus not auto-set on open / not following last touched pane
  type: bug
  priority: high
  difficulty: easy
  frequency: always
  expected: |
    - Opening a new terminal pane auto-focuses the cursor into that terminal.
    - In multi-pane view, the cursor/keystrokes go to the most recently
      touched (clicked or focused) terminal.
  actual: |
    - New terminal panes don't auto-focus; user must click into them.
    - In multi-pane, focus doesn't follow the last-touched terminal —
      keystrokes may go to a stale pane.
  reproduction: |
    1. Open a project, split into 2+ terminal panes
    2. Click into pane B, then click into pane A — type in A
    3. Observe: keystrokes may go to B (or neither)
    4. Open a new pane via "+" or terminal launch
    5. Observe: new pane is not focused; cursor sits elsewhere
  impact: Terminal UX; users must manually click every new pane and may
    send input to the wrong terminal when switching
  images: null
  github_ref: null
  plan: |
    ### Goal
    Auto-focus xterm cursor in a newly opened terminal pane; in multi-pane
    view, the last-touched pane's terminal receives focus.

    ### Root cause
    TerminalView.tsx:79-83 focus useEffect runs BEFORE the main useEffect
    (line 86-308) that creates the xterm instance. On first mount, termRef
    is null when the focus effect runs, so term.focus() is silently
    skipped. The effect doesn't re-run after the term is created.

    ### Files to change
    - MODIFY: src/components/PaneGrid/TerminalView.tsx

    ### Approach
    1. In the main useEffect after term.open(container), if active+isTabActive
       call term.focus() inside requestAnimationFrame to ensure textarea
       is in the DOM.
    2. Keep existing focus useEffect (line 79-83) for click→active flips
       on already-mounted panes.
    3. Add explicit term.focus() in Pane's onClick via a ref passed to
       TerminalView, as a belt-and-suspenders for multi-pane clicks.

    ### Edge cases
    - Tab hidden: isTabActive false → no focus
    - Rapid tab/pane switches: rAF coalesces to one focus per frame
    - Empty pane (no term): click falls through to agent buttons
  status: in-progress
---
```
