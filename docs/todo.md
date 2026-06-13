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
  status: in-progress
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
```
