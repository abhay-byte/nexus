# Nexus v0.2.0

<img src="https://github.com/abhay-byte/nexus/raw/v0.2.0/src-tauri/icons/icon.png" width="128" height="128" alt="Nexus Logo">

Multi-project AI agent workspace with integrated terminal.

## Downloads

### Desktop App (Linux)

**x86_64:**
| Format | File | Size |
|---|---|---|
| Debian/Ubuntu | `Nexus_0.2.0_amd64.deb` | ~7 MB |
| RHEL/Fedora | `Nexus-0.2.0-1.x86_64.rpm` | ~7 MB |
| Tarball | `Nexus_linux_x64.tar.gz` | ~6 MB |
| Raw binary | `nexus-linux-x86_64` | ~17 MB |

*(Note: ARM64 binaries were skipped in this release and can be built manually using the provided Docker script)*

### Headless Server (Linux)

| File | Size |
|---|---|
| `nexus-headless-linux-x86_64` | ~4 MB |

**Run headless server:**
```bash
./nexus-headless-linux-x86_64
# Open http://localhost:7878 in your browser
```

### Windows
| File | Size |
|---|---|
| `nexus-windows-x86_64.exe` | ~15 MB |
| `Nexus_0.2.0_x64-setup.exe` | ~5 MB |

## Changelog

### What's New

- **T1: Fix terminal/WebUI freeze when running CLI tools**
  - Removed per-chunk status updates which overwhelmed the React state.
  - Wrapped `directWriter` in `requestAnimationFrame` for smoother unblocking rendering.
  - Coalesced PTY reads into 16ms windows in the Rust backend to prevent Tauri event spam.
- **T2: Terminal focus lost on project switch and first CLI tool run**
  - Resolved an issue where terminal instances wouldn't automatically focus when changing active projects or launching a new shell.
  - Threaded a new `isProjectActive` property to ensure proper React focus effects.

### Fixes

- **fix:** resolve workspace icons via headless server API in browser mode.
- **fix:** flush pending directWriter chunks on unregister.

### Maintenance

- **docs:** added `docs/free` and updated `building-windows.md` references for the prior release.

## New Binaries

| Binary | Purpose |
|---|---|
| `nexus` | Desktop app with Tauri GUI |
| `nexus-headless` | Standalone HTTP + WebSocket server |

## Environment Variables (Headless)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXUS_PORT` | `7878` | HTTP server port |
| `NEXUS_WS_PORT` | `7879` | WebSocket server port |
| `NEXUS_ALLOW_IPS` | — | Comma-separated extra allowed IPs |

## Sources

- Full changelog and commits: https://github.com/abhay-byte/nexus/compare/v0.1.9...v0.2.0
