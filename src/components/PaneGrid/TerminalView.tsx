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
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Held across renders so the tab-switch effect can call fit() without
  // tearing down and recreating the terminal.
  const fitAddonRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const renderedLogRef = useRef("");
  const exitNoticeRef = useRef(false);

  const writeToSession = useSessionStore((state) => state.writeToSession);
  const resizeSession = useSessionStore((state) => state.resizeSession);
  const paneZoom = useSessionStore((state) => state.paneZooms[paneId] ?? 0);
  const adjustPaneZoom = useSessionStore((state) => state.adjustPaneZoom);
  const sessionLog = useSessionStore((state) => state.sessionLogs[session.id] ?? "");
  const sessionStatus = useSessionStore((state) => state.sessions[session.id]?.status ?? session.status);

  const fitVisibleTerminal = () => {
    const container = containerRef.current;
    const fitAddon = fitAddonRef.current;
    const term = termRef.current;
    if (!container || !fitAddon || !term || !isTabActive) return;
    if (container.clientWidth < 16 || container.clientHeight < 16) return;
    fitAddon.fit();
    void resizeSession(session.id, Math.max(term.cols, 2), Math.max(term.rows, 2));
  };

  // ── Re-fit when this tab becomes active ─────────────────────────────────
  // Runs whenever isTabActive flips. When it becomes true the container has
  // just been un-hidden (display:none → block), so we wait one rAF for
  // layout to settle then call fit() and sync the PTY dimensions.
  useEffect(() => {
    if (!isTabActive) return;
    const raf = requestAnimationFrame(() => {
      fitVisibleTerminal();
    });
    return () => cancelAnimationFrame(raf);
  }, [isTabActive, resizeSession, session.id]);

  // ── Main terminal setup ──────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      convertEol: false,
      scrollback,
      fontFamily: `${fontFamily}, 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace`,
      fontSize: fontSize + paneZoom,
      fontWeight: "400",
      fontWeightBold: "700",
      letterSpacing: 0,
      lineHeight: 1.2,
      cursorStyle,
      cursorBlink: false, /* forced off per request */
      allowTransparency: false,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
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

    // Defer the initial fit by one rAF so the container has stable dimensions.
    const initialFitRaf = requestAnimationFrame(() => {
      fitVisibleTerminal();
    });

    const resizeObserver = new ResizeObserver(() => {
      fitVisibleTerminal();
    });
    resizeObserver.observe(container);

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
      cancelAnimationFrame(initialFitRaf);
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

  useEffect(() => {
    const term = termRef.current;
    if (!term) {
      return;
    }

    const previous = renderedLogRef.current;
    if (sessionLog === previous) {
      return;
    }

    if (!sessionLog.startsWith(previous)) {
      term.reset();
      renderedLogRef.current = sessionLog;
      if (sessionLog) {
        term.write(sessionLog, () => {
          term.options.cursorBlink = false;
        });
      }
      return;
    }

    const delta = sessionLog.slice(previous.length);
    renderedLogRef.current = sessionLog;
    if (!delta) {
      return;
    }

    term.write(delta, () => {
      term.options.cursorBlink = false;
    });
  }, [sessionLog]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) {
      return;
    }

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
