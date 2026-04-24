import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useSessionStore } from "../../store/sessionStore";
import type { Session } from "../../types";

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
  const renderedLogRef = useRef("");
  const exitNoticeRef = useRef(false);
  const isTabActiveRef = useRef(isTabActive);
  isTabActiveRef.current = isTabActive;

  const writeToSession = useSessionStore((state) => state.writeToSession);
  const resizeSession = useSessionStore((state) => state.resizeSession);
  const paneZoom = useSessionStore((state) => state.paneZooms[paneId] ?? 0);
  const adjustPaneZoom = useSessionStore((state) => state.adjustPaneZoom);
  const sessionLog = useSessionStore((state) => state.sessionLogs[session.id] ?? "");
  const sessionStatus = useSessionStore((state) => state.sessions[session.id]?.status ?? session.status);

  // ── Core fit logic (reads latest refs, safe for ResizeObserver) ───────────
  const doFit = (force = false) => {
    const container = containerRef.current;
    const fitAddon = fitAddonRef.current;
    const term = termRef.current;
    if (!container || !fitAddon || !term || !isTabActiveRef.current) return;
    if (container.clientWidth < 16 || container.clientHeight < 16) return;

    const prevCols = term.cols;
    const prevRows = term.rows;
    fitAddon.fit();
    if (force || term.cols !== prevCols || term.rows !== prevRows) {
      void resizeSession(session.id, Math.max(term.cols, 2), Math.max(term.rows, 2));
    }
  };

  // ── Re-fit when this tab becomes active or pane gains focus ──────────────
  useEffect(() => {
    if (!isTabActive) return;
    // Give the browser time to layout the now-visible container
    const timer = setTimeout(() => {
      doFit();
    }, 50);
    return () => clearTimeout(timer);
  }, [isTabActive, active, session.id]);

  // ── Focus terminal when pane becomes active ──────────────────────────────
  useEffect(() => {
    const term = termRef.current;
    if (!term || !active || !isTabActive) return;
    term.focus();
  }, [active, isTabActive]);

  // ── Main terminal setup ──────────────────────────────────────────────────
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

    const initialLog = useSessionStore.getState().sessionLogs[session.id] ?? "";
    renderedLogRef.current = initialLog;
    if (initialLog) {
      term.write(initialLog, () => {
        term.options.cursorBlink = false;
      });
    }
    exitNoticeRef.current = false;

    // Wait for fonts to load before fitting so cell dimensions are correct.
    const initialFitTimer = setTimeout(() => {
      void document.fonts.ready.then(() => {
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
    // to SIGWINCH (e.g. opentui). Forces a resize_pty heartbeat even when
    // dimensions haven't changed so the PTY stays in sync.
    const periodicFitTimer = window.setInterval(() => {
      doFit(true);
    }, 3000);

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

    return () => {
      fitAddonRef.current = null;
      termRef.current = null;
      clearTimeout(initialFitTimer);
      window.clearInterval(periodicFitTimer);
      if (resizeDebounceTimer !== null) {
        window.clearTimeout(resizeDebounceTimer);
      }
      disposeData.dispose();
      resizeObserver.disconnect();
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("mouseup", mouseUp);
      container.removeEventListener("wheel", wheelHandler);
      term.dispose();
    };
  }, [
    adjustPaneZoom,
    cursorBlink,
    cursorStyle,
    fontFamily,
    fontSize,
    paneId,
    paneZoom,
    resizeSession,
    scrollback,
    session.id,
    writeToSession,
  ]);

  // ── Write new session output ─────────────────────────────────────────────
  // CRITICAL: only write to xterm.js when this tab is visible. Hidden
  // terminals still accumulate log state for search/export, but we skip
  // the actual xterm write to prevent renderer overload / DOM bloat.
  useEffect(() => {
    const term = termRef.current;
    if (!term || !isTabActive) return;

    const previous = renderedLogRef.current;
    if (sessionLog === previous) return;

    if (sessionLog.startsWith(previous)) {
      const delta = sessionLog.slice(previous.length);
      renderedLogRef.current = sessionLog;
      if (delta) {
        term.write(delta, () => {
          term.options.cursorBlink = false;
        });
      }
      return;
    }

    if (previous.endsWith(sessionLog)) {
      // Log was truncated from the beginning (hits 500K limit).
      // Do NOT reset the terminal — TUI state would be destroyed.
      renderedLogRef.current = sessionLog;
      return;
    }

    // Unexpected mismatch (should be rare). Reset and rewrite.
    term.reset();
    renderedLogRef.current = sessionLog;
    if (sessionLog) {
      term.write(sessionLog, () => {
        term.options.cursorBlink = false;
      });
    }
  }, [sessionLog, isTabActive]);

  // ── Catch-up when tab becomes visible after being hidden ─────────────────
  useEffect(() => {
    if (!isTabActive) return;
    const term = termRef.current;
    if (!term) return;

    const previous = renderedLogRef.current;
    const current = sessionLog;
    if (current === previous) return;

    if (current.startsWith(previous)) {
      const delta = current.slice(previous.length);
      renderedLogRef.current = current;
      if (delta) {
        term.write(delta, () => {
          term.options.cursorBlink = false;
        });
      }
    } else if (!previous.endsWith(current)) {
      // We missed output while hidden — reset and catch up
      term.reset();
      renderedLogRef.current = current;
      if (current) {
        term.write(current, () => {
          term.options.cursorBlink = false;
        });
      }
    } else {
      renderedLogRef.current = current;
    }
  }, [isTabActive, sessionLog]);

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
