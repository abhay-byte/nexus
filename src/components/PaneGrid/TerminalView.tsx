import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
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

  const writeToSession = useSessionStore((state) => state.writeToSession);
  const resizeSession = useSessionStore((state) => state.resizeSession);
  const markSessionStatus = useSessionStore((state) => state.markSessionStatus);
  const noteSessionActivity = useSessionStore((state) => state.noteSessionActivity);
  const appendSessionOutput = useSessionStore((state) => state.appendSessionOutput);
  const paneZoom = useSessionStore((state) => state.paneZooms[paneId] ?? 0);
  const adjustPaneZoom = useSessionStore((state) => state.adjustPaneZoom);

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

    let unlistenOutput: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;

    void listen<number[]>(`pty-output:${session.id}`, (event) => {
      const payload = new Uint8Array(event.payload);
      term.options.cursorBlink = false;
      term.write(payload, () => { term.options.cursorBlink = false; });
      markSessionStatus(session.id, "running");
      noteSessionActivity(session.id);
      appendSessionOutput(session.id, payload);
    }).then((dispose) => { unlistenOutput = dispose; });

    void listen(`pty-exit:${session.id}`, () => {
      markSessionStatus(session.id, "exited");
      term.writeln("\r\n[process exited]");
    }).then((dispose) => { unlistenExit = dispose; });

    return () => {
      fitAddonRef.current = null;
      termRef.current = null;
      cancelAnimationFrame(initialFitRaf);
      unlistenOutput?.();
      unlistenExit?.();
      disposeData.dispose();
      resizeObserver.disconnect();
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("mouseup", mouseUp);
      container.removeEventListener("wheel", wheelHandler);
      term.dispose();
    };
  }, [
    adjustPaneZoom,
    appendSessionOutput,
    cursorBlink,
    cursorStyle,
    fontFamily,
    fontSize,
    markSessionStatus,
    noteSessionActivity,
    paneId,
    paneZoom,
    resizeSession,
    scrollback,
    session.id,
    writeToSession,
  ]);

  return <div className="terminal-view" ref={containerRef} />;
}
