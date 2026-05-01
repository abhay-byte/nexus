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
