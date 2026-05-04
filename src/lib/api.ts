/**
 * Nexus API Abstraction Layer
 * Works in both Tauri desktop mode and browser mode
 */

import { invoke as tauriInvoke, isTauri as tauriIsTauri } from "@tauri-apps/api/core";

/** Detect if running inside Tauri desktop app */
export const isTauri = tauriIsTauri;

const API_BASE = (() => {
  const host = window.location.host;
  return `http://${host}`;
})();

const WS_BASE = (() => {
  const host = window.location.host;
  return `ws://${host}`;
})();

/** Unified invoke that works in both Tauri and browser */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    return tauriInvoke<T>(cmd, args);
  }
  // Browser mode: call HTTP API
  const resp = await fetch(`${API_BASE}/api/${cmd.replace(/_/g, "-")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

/** HTTP-only API for browser mode (projects, kanban, etc.) */
export const httpApi = {
  async get<T>(path: string): Promise<T> {
    const resp = await fetch(`${API_BASE}${path}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async post<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  },

  async put<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  },

  async del(path: string): Promise<void> {
    const resp = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  },
};

// ── Browser-mode Tauri event bridge ────────────────────────────────────────
// Maps Tauri-style event listeners to WebSocket messages

const wsListeners = new Map<string, Set<(payload: unknown) => void>>();
let sharedWs: WebSocket | null = null;
let sharedWsReady = false;

function base64Encode(bytes: Uint8Array): string {
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binString);
}

function ensureSharedWs(): WebSocket {
  if (sharedWs?.readyState === WebSocket.OPEN) return sharedWs;
  if (sharedWs?.readyState === WebSocket.CONNECTING) return sharedWs;

  const wsUrl = WS_BASE.replace(/:\d+/, ":7879") + "/ws";
  sharedWs = new WebSocket(wsUrl);
  sharedWs.binaryType = "arraybuffer";
  sharedWsReady = false;

  sharedWs.onopen = () => {
    sharedWsReady = true;
  };

  sharedWs.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) {
      // Backend now sends PTY output as JSON text with session_id.
      // Legacy binary frames are ignored.
      return;
    }
    if (typeof e.data === "string") {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.event === "exit" && parsed.session_id) {
          const cbs = wsListeners.get(`pty-exit:${parsed.session_id}`);
          cbs?.forEach((cb) => cb(undefined));
        } else if (parsed.event === "spawned" && parsed.session_id) {
          const cbs = wsListeners.get(`pty-spawned:${parsed.session_id}`);
          cbs?.forEach((cb) => cb(undefined));
        } else if (parsed.event === "pty-output" && parsed.session_id && parsed.data) {
          const cbs = wsListeners.get(`pty-output:${parsed.session_id}`);
          if (cbs) {
            const binString = atob(parsed.data);
            const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0));
            cbs.forEach((cb) => cb(Array.from(bytes)));
          }
        }
      } catch {
        // ignore malformed JSON
      }
    }
  };

  sharedWs.onclose = () => {
    sharedWsReady = false;
    sharedWs = null;
  };

  return sharedWs;
}

/** Spawn PTY via WebSocket (browser mode only) */
export function wsSpawn(opts: {
  sessionId: string;
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  shellOverride?: string;
}): Promise<void> {
  return new Promise((resolve) => {
    const ws = ensureSharedWs();

    const sendSpawn = () => {
      ws.send(
        JSON.stringify({
          type: "spawn",
          session_id: opts.sessionId,
          command: opts.command,
          args: opts.args ?? [],
          cwd: opts.cwd,
          env: opts.env ?? {},
          cols: opts.cols ?? 80,
          rows: opts.rows ?? 24,
          shell_override: opts.shellOverride,
        })
      );
      // Resolve immediately — output streams via pty-output listener
      setTimeout(() => resolve(), 100);
    };

    if (ws.readyState === WebSocket.OPEN) {
      sendSpawn();
    } else {
      ws.onopen = () => {
        sharedWsReady = true;
        sendSpawn();
      };
    }

    // Safety timeout — should never hit since we resolve after send
    setTimeout(() => {
      resolve();
    }, 3000);
  });
}

/** Write to PTY via WebSocket */
export function wsWrite(sessionId: string, data: Uint8Array): void {
  const ws = ensureSharedWs();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "write",
        session_id: sessionId,
        data: base64Encode(data),
      })
    );
  }
}

/** Resize PTY via WebSocket */
export function wsResize(sessionId: string, cols: number, rows: number): void {
  const ws = ensureSharedWs();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "resize",
        session_id: sessionId,
        cols,
        rows,
      })
    );
  }
}

/** Kill PTY via WebSocket */
export function wsKill(sessionId: string): void {
  const ws = ensureSharedWs();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "kill",
        session_id: sessionId,
      })
    );
  }
}

/** Tauri-style event listener that works in browser mode via WebSocket */
export async function listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void> {
  if (isTauri()) {
    const { listen: tauriListen } = await import("@tauri-apps/api/event");
    return tauriListen(event, handler);
  }

  // Browser mode: use WebSocket event bridge
  ensureSharedWs();

  const cb = (payload: unknown) => {
    handler({ payload: payload as T });
  };

  let cbs = wsListeners.get(event);
  if (!cbs) {
    cbs = new Set();
    wsListeners.set(event, cbs);
  }
  cbs.add(cb);

  return () => {
    cbs?.delete(cb);
    if (cbs && cbs.size === 0) {
      wsListeners.delete(event);
    }
  };
}

/** Send data to PTY via shared WebSocket */
export function wsSend(data: Uint8Array): void {
  const ws = ensureSharedWs();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}

/** Send JSON command via shared WebSocket */
export function wsSendJson(cmd: unknown): void {
  const ws = ensureSharedWs();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(cmd));
  }
}

/** WebSocket for real-time terminal in browser mode */
export class TerminalSocket {
  private ws: WebSocket | null = null;
  private onMessageCb: ((data: Uint8Array) => void) | null = null;
  private onOpenCb: (() => void) | null = null;
  private onCloseCb: (() => void) | null = null;
  private onEventCb: ((event: string, payload: unknown) => void) | null = null;

  connect(sessionId: string): void {
    if (isTauri()) return;
    const wsUrl = WS_BASE.replace(/:\d+/, ":7879") + "/ws";
    this.ws = new WebSocket(wsUrl);

    this.ws.binaryType = "arraybuffer";
    this.ws.onopen = () => this.onOpenCb?.();
    this.ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        this.onMessageCb?.(new Uint8Array(e.data));
      } else if (typeof e.data === "string") {
        try {
          const parsed = JSON.parse(e.data);
          this.onEventCb?.(parsed.event, parsed);
        } catch {
          // ignore non-JSON string messages
        }
      }
    };
    this.ws.onclose = () => this.onCloseCb?.();
    this.ws.onerror = (e) => console.error("Terminal WS error:", e);
  }

  spawn(opts: {
    sessionId: string;
    command: string;
    args?: string[];
    cwd: string;
    env?: Record<string, string>;
    cols?: number;
    rows?: number;
    shellOverride?: string;
  }): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "spawn",
        session_id: opts.sessionId,
        command: opts.command,
        args: opts.args ?? [],
        cwd: opts.cwd,
        env: opts.env ?? {},
        cols: opts.cols ?? 80,
        rows: opts.rows ?? 24,
        shell_override: opts.shellOverride,
      })
    );
  }

  send(data: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "resize",
        session_id: sessionId,
        cols,
        rows,
      })
    );
  }

  kill(sessionId: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "kill",
        session_id: sessionId,
      })
    );
  }

  onMessage(cb: (data: Uint8Array) => void): void {
    this.onMessageCb = cb;
  }

  onEvent(cb: (event: string, payload: unknown) => void): void {
    this.onEventCb = cb;
  }

  onOpen(cb: () => void): void {
    this.onOpenCb = cb;
  }

  onClose(cb: () => void): void {
    this.onCloseCb = cb;
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
