# Terminal Rendering Fix — Technical Reference

> Fixes terminal rendering corruption that occurs after extended use.

## Symptoms

- Text becomes garbled/corrupted after the terminal has been open for several minutes
- Glyphs render as solid blocks or disappear entirely
- TUI applications (htop, vim, opencode) show visual artifacts after OS sleep/wake
- Output from long-running builds or processes causes progressive degradation

## Architecture: Data Pipeline

```
PTY Process
  ↓ (raw bytes, 8KB chunks)
Rust Backend (pty.rs / ws_server.rs)
  ↓ (Tauri events or WebSocket binary frames)
sessionStore.ts — appendSessionOutput()
  ↓ (TextDecoder → string → batched via 100ms flush timer)
sessionLogs[sessionId] — Zustand state (500KB limit)
  ↓ (React re-render on state change)
TerminalView.tsx — useEffect on sessionLog
  ↓ (delta slicing: only new bytes sent to xterm)
xterm.js term.write(delta)
  ↓ (Canvas/WebGL texture atlas rendering)
Screen
```

## Root Causes

### 1. Texture Atlas Corruption

xterm.js v5 (`@xterm/xterm@^5.5.0`) uses a **texture atlas** — a bitmap cache of rendered glyphs — for its Canvas/WebGL renderer. This atlas can become corrupted due to:

- **GPU context loss** (OS sleep/wake, display driver reset)
- **Prolonged rendering** exhausting atlas space  
- **Browser tab backgrounding** releasing GPU resources

**Fix:** Periodically call `terminal.clearTextureAtlas()` every 30 seconds and on `document.visibilitychange` events. This forces a clean rebuild of all glyph bitmaps.

### 2. Unbounded xterm.js Write Buffer (No Flow Control)

`term.write()` is non-blocking and buffers data internally. When the PTY produces output faster than the renderer can paint (e.g., `cat largefile`, build floods), the write queue grows unbounded → GC pressure → frame drops → rendering falls behind → atlas corruption.

**Fix:** Implement watermark-based flow control:
- Track `pendingWriteBytes` via the `term.write()` callback
- When pending > `HIGH_WATERMARK` (64KB): batch subsequent writes
- When pending < `LOW_WATERMARK` (8KB): resume normal writing

### 3. Session Log String Churn

The Zustand store concatenates all PTY output into a single JS string (`sessionLogs[id]`) up to 500KB. Every 100ms flush creates a new string via `slice(-500000)`. The `TerminalView` component then computes deltas by slicing this string.

This causes:
- ~1MB+ of transient string allocations per session per minute
- GC pauses → dropped frames → visual glitches

**Fix:** Reduce limit to 250KB. The log is primarily for search/export; xterm.js maintains its own scrollback buffer independently.

### 4. Excessive Periodic Resize (SIGWINCH Spam)

A `setInterval` fires `doFit(true)` every **3 seconds** with `force=true`, which unconditionally sends `resize_pty` IPC to the Rust backend. This generates constant SIGWINCH signals that interrupt TUI programs mid-redraw, causing partial screen updates and visual corruption.

**Fix:** Change interval to 10 seconds, remove `force=true`. Only send resize IPC when `cols` or `rows` actually change.

### 5. Terminal Destruction on Settings Change

The main `useEffect` that creates the `Terminal` instance includes `fontSize`, `fontFamily`, `scrollback`, `cursorStyle`, `cursorBlink`, and `paneZoom` in its dependency array. Changing any of these destroys and recreates the entire Terminal, losing rendered state.

**Fix:** Split into two effects:
- **Creation effect**: depends only on `session.id` and `paneId`
- **Options effect**: updates `term.options.*` without recreating the Terminal

## Files Modified

| File | Change |
|------|--------|
| `src/components/PaneGrid/TerminalView.tsx` | Texture atlas refresh, flow control, reduced periodic fit, stable deps |
| `src/store/sessionStore.ts` | Reduced `SESSION_LOG_LIMIT`, graceful truncation handling |

## Testing

| Scenario | What to verify |
|----------|----------------|
| Long-running output (`while true; do date; sleep 1; done`) | No corruption after 10+ minutes |
| Rapid flood (`cat /dev/urandom \| hexdump`) | Flow control prevents freeze/crash |
| TUI app (`htop`, `vim`) | Reduced SIGWINCH doesn't break rendering |
| OS sleep/wake cycle | `visibilitychange` handler refreshes atlas |
| Change font size in settings | Terminal updates without destroying state |
| Multiple terminal tabs | Each tab catches up correctly when switching |

## References

- [xterm.js API: clearTextureAtlas()](https://xtermjs.org/docs/api/terminal/classes/terminal/#cleartextureatlas)
- [xterm.js API: refresh(start, end)](https://xtermjs.org/docs/api/terminal/classes/terminal/#refresh)
- [xterm.js Flow Control Guide](https://xtermjs.org/docs/guides/flowcontrol/)
- [WebGL Context Loss Handling](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)
