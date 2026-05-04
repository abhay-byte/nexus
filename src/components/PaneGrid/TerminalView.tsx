import { useEffect, useRef, useCallback } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useSessionStore } from "../../store/sessionStore";
import { registerDirectWriter, unregisterDirectWriter } from "../../lib/directWriter";
import type { Session } from "../../types";

/** How often to clear the texture atlas to prevent glyph corruption (ms). */
const ATLAS_REFRESH_INTERVAL_MS = 30_000;

/** How often to re-check PTY dimensions as a TUI fallback (ms). */
const PERIODIC_FIT_INTERVAL_MS = 10_000;

interface TerminalViewProps {
  session: Session;
  paneId: string;
  fontFamily: string;
  fontSize: number;
  scrollback: number;
  cursorStyle: "block" | "bar" | "underline";
  cursorBlink: boolean;
  /** True when the parent terminal tab is currently visible. */
  isTabActive: boolean;
  /** True when this pane has keyboard focus. */
  active: boolean;
}

export function TerminalView({
  session,
  paneId,
  fontFamily,
  fontSize,
  scrollback,
  cursorStyle,
  cursorBlink,
  isTabActive,
  active,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const exitNoticeRef = useRef(false);
  const isTabActiveRef = useRef(isTabActive);
  isTabActiveRef.current = isTabActive;

  const writeToSession = useSessionStore((state) => state.writeToSession);
  const resizeSession = useSessionStore((state) => state.resizeSession);
  const paneZoom = useSessionStore((state) => state.paneZooms[paneId] ?? 0);
  const adjustPaneZoom = useSessionStore((state) => state.adjustPaneZoom);
  const sessionStatus = useSessionStore((state) => state.sessions[session.id]?.status ?? session.status);

  // ── Core fit logic (reads latest refs, safe for ResizeObserver) ───────────
  const doFit = useCallback(() => {
    const container = containerRef.current;
    const fitAddon = fitAddonRef.current;
    const term = termRef.current;
    if (!container || !fitAddon || !term || !isTabActiveRef.current) return;
    if (container.clientWidth < 16 || container.clientHeight < 16) return;

    const prevCols = term.cols;
    const prevRows = term.rows;
    fitAddon.fit();
    if (term.cols !== prevCols || term.rows !== prevRows) {
      void resizeSession(session.id, Math.max(term.cols, 2), Math.max(term.rows, 2));
    }
  }, [resizeSession, session.id]);

  // ── Re-fit when this tab becomes active or pane gains focus ──────────────
  useEffect(() => {
    if (!isTabActive) return;
    const timer = setTimeout(() => doFit(), 50);
    return () => clearTimeout(timer);
  }, [isTabActive, active, session.id, doFit]);

  // ── Focus terminal when pane becomes active ──────────────────────────────
  useEffect(() => {
    const term = termRef.current;
    if (!term || !active || !isTabActive) return;
    term.focus();
  }, [active, isTabActive]);

  // ── Main terminal setup (stable deps — only recreate on session change) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      convertEol: false,
      scrollback,
      fontFamily: `${fontFamily}, 'JetBrainsMono Nerd Font', 'CaskaydiaCove Nerd Font', 'FiraCode Nerd Font', 'Hack Nerd Font', 'Symbols Nerd Font Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Noto Sans Mono', 'DejaVu Sans Mono', 'Liberation Mono', 'Consolas', monospace`,
      fontSize: fontSize + paneZoom,
      fontWeight: "400",
      fontWeightBold: "700",
      letterSpacing: 0,
      lineHeight: 1.0,
      cursorStyle,
      cursorBlink: false, /* forced off per request */
      allowTransparency: false,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
      screenReaderMode: false,
      theme: {
        background: "#0d0d0d",
        foreground: "#d4d4d4",
        cursor: "#ffffff",
        cursorAccent: "#0d0d0d",
        selectionBackground: "#264f78",
        selectionForeground: "#ffffff",
        black: "#000000",
        brightBlack: "#666666",
        red: "#cd3131",
        brightRed: "#f14c4c",
        green: "#0dbc79",
        brightGreen: "#23d18b",
        yellow: "#e5e510",
        brightYellow: "#f5f543",
        blue: "#2472c8",
        brightBlue: "#3b8eea",
        magenta: "#bc3fbc",
        brightMagenta: "#d670d6",
        cyan: "#11a8cd",
        brightCyan: "#29b8db",
        white: "#e5e5e5",
        brightWhite: "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    const linksAddon = new WebLinksAddon();

    fitAddonRef.current = fitAddon;
    termRef.current = term;

    term.loadAddon(fitAddon);
    term.loadAddon(linksAddon);
    term.open(container);

    // Write any existing log content that accumulated before the terminal
    // was mounted (e.g. session restore, tab switch catch-up).
    const initialLog = useSessionStore.getState().sessionLogs[session.id] ?? "";
    if (initialLog) {
      term.write(initialLog, () => {
        term.options.cursorBlink = false;
      });
    }
    exitNoticeRef.current = false;

    // ── Register direct writer ────────────────────────────────────────────
    // This bypasses the Zustand sessionLogs string entirely for rendering.
    // PTY output goes directly from the event listener → xterm.js with no
    // intermediate string accumulation, truncation, or delta computation.
    // The sessionLogs string still accumulates for search/export only.
    const decoder = new TextDecoder();
    registerDirectWriter(session.id, (chunk: Uint8Array) => {
      if (!isTabActiveRef.current) return; // skip writes to hidden terminals
      const text = decoder.decode(chunk, { stream: true });
      if (text) {
        term.write(text);
      }
    });

    // Wait for fonts to load before fitting so cell dimensions are correct.
    // Use document.fonts.load() with the specific font to avoid hanging on
    // mobile browsers when fallback fonts are unavailable.
    const initialFitTimer = setTimeout(() => {
      void document.fonts.load(`${fontSize + paneZoom}px "${fontFamily}"`).then(() => {
        doFit();
      }).catch(() => {
        // Even if font loading fails, fit with whatever is available
        doFit();
      });
    }, 50);

    // Debounced ResizeObserver — prevents fit() loops when layout is unstable.
    let resizeDebounceTimer: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeDebounceTimer !== null) {
        window.clearTimeout(resizeDebounceTimer);
      }
      resizeDebounceTimer = window.setTimeout(() => {
        resizeDebounceTimer = null;
        doFit();
      }, 150);
    });
    resizeObserver.observe(container);

    // Periodic re-fit as a fallback for TUIs that don't reliably respond
    // to SIGWINCH (e.g. opentui). Only sends resize_pty when dimensions
    // actually change to avoid unnecessary SIGWINCH signals.
    const periodicFitTimer = window.setInterval(() => {
      doFit();
    }, PERIODIC_FIT_INTERVAL_MS);

    // ── Periodic texture atlas refresh ────────────────────────────────────
    // xterm.js's canvas renderer caches glyph bitmaps in a texture atlas.
    // Over time (GPU context loss, sleep/wake, prolonged use) the atlas can
    // become corrupted. Periodically clearing it forces a clean rebuild.
    const atlasRefreshTimer = window.setInterval(() => {
      try {
        term.clearTextureAtlas();
      } catch {
        // clearTextureAtlas may not be available on older xterm versions
      }
    }, ATLAS_REFRESH_INTERVAL_MS);

    // ── Visibility change handler (sleep/wake, tab switch) ────────────────
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && isTabActiveRef.current) {
        try {
          term.clearTextureAtlas();
          term.refresh(0, term.rows - 1);
        } catch {
          // Graceful fallback
        }
        setTimeout(() => doFit(), 100);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const disposeData = term.onData((data) => {
      void writeToSession(session.id, new TextEncoder().encode(data));
    });

    term.attachCustomKeyEventHandler((event) => {
      if (event.type === "keydown" && event.ctrlKey && event.shiftKey && event.code === "KeyC") {
        if (term.hasSelection()) void navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      if (event.type === "keydown" && event.ctrlKey && event.shiftKey && event.code === "KeyV") {
        void navigator.clipboard.readText().then((text) => {
          void writeToSession(session.id, new TextEncoder().encode(text));
        });
        return false;
      }
      return true;
    });

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      void navigator.clipboard.readText().then((text) => {
        void writeToSession(session.id, new TextEncoder().encode(text));
      });
    };
    container.addEventListener("contextmenu", onContextMenu);

    const mouseUp = () => {
      if (term.hasSelection()) void navigator.clipboard.writeText(term.getSelection());
    };
    container.addEventListener("mouseup", mouseUp);

    const wheelHandler = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      adjustPaneZoom(paneId, event.deltaY < 0 ? 1 : -1);
    };
    container.addEventListener("wheel", wheelHandler, { passive: false });

    const dragOverHandler = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };
    container.addEventListener("dragover", dragOverHandler);

    const dropHandler = (event: DragEvent) => {
      event.preventDefault();
      const path = event.dataTransfer?.getData("text/plain");
      if (path) {
        void writeToSession(session.id, new TextEncoder().encode(path));
      }
    };
    container.addEventListener("drop", dropHandler);

    return () => {
      unregisterDirectWriter(session.id);
      fitAddonRef.current = null;
      termRef.current = null;
      clearTimeout(initialFitTimer);
      window.clearInterval(periodicFitTimer);
      window.clearInterval(atlasRefreshTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (resizeDebounceTimer !== null) {
        window.clearTimeout(resizeDebounceTimer);
      }
      disposeData.dispose();
      resizeObserver.disconnect();
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("mouseup", mouseUp);
      container.removeEventListener("wheel", wheelHandler);
      container.removeEventListener("dragover", dragOverHandler);
      container.removeEventListener("drop", dropHandler);
      term.dispose();
    };
    // Stable deps: only recreate the Terminal on session or pane identity change.
    // Settings changes (font, scrollback, cursor) are handled by the options effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, paneId]);

  // ── Update terminal options without recreating the instance ──────────────
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    term.options.fontFamily = `${fontFamily}, 'JetBrainsMono Nerd Font', 'CaskaydiaCove Nerd Font', 'FiraCode Nerd Font', 'Hack Nerd Font', 'Symbols Nerd Font Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Noto Sans Mono', 'DejaVu Sans Mono', 'Liberation Mono', 'Consolas', monospace`;
    term.options.fontSize = fontSize + paneZoom;
    term.options.scrollback = scrollback;
    term.options.cursorStyle = cursorStyle;

    setTimeout(() => doFit(), 50);
  }, [fontFamily, fontSize, paneZoom, scrollback, cursorStyle, cursorBlink, doFit]);

  // ── Catch-up when tab becomes visible after being hidden ─────────────────
  // When a terminal tab was hidden, direct writes were skipped. We need to
  // replay any output that accumulated in the sessionLog while hidden.
  useEffect(() => {
    if (!isTabActive) return;
    const term = termRef.current;
    if (!term) return;

    // On becoming visible, refresh the atlas and force a full redraw to
    // recover from any GPU context loss while hidden.
    try {
      term.clearTextureAtlas();
      term.refresh(0, term.rows - 1);
    } catch {
      // Graceful fallback
    }
  }, [isTabActive]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    if (sessionStatus === "exited") {
      if (!exitNoticeRef.current) {
        term.writeln("\r\n[process exited]");
        exitNoticeRef.current = true;
      }
      return;
    }

    exitNoticeRef.current = false;
  }, [sessionStatus]);

  return <div className="terminal-view" ref={containerRef} />;
}
