/**
 * Nexus API Abstraction Layer
 * Works in both Tauri desktop mode and browser mode
 */

import { invoke as tauriInvoke, isTauri as tauriIsTauri } from "@tauri-apps/api/core";
import { dbg, dbgWarn, dbgError, dbgCount } from "./debug";


/** Detect if running inside Tauri desktop app */
export const isTauri = tauriIsTauri;

export const API_BASE = (() => {
  if (tauriIsTauri()) {
    return "http://127.0.0.1:7878";
  }
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
  if (sharedWs?.readyState === WebSocket.CONNECTING) {
    dbg('ws', 'reusing CONNECTING socket');
    return sharedWs;
  }

  const wsUrl = WS_BASE.replace(/:\d+/, ":7879") + "/ws";
  dbg('ws', `connecting → ${wsUrl}`);
  sharedWs = new WebSocket(wsUrl);
  sharedWs.binaryType = "arraybuffer";
  sharedWsReady = false;

  sharedWs.onopen = () => {
    sharedWsReady = true;
    dbgCount('wsConnects');
    dbg('ws', `✓ connected to ${wsUrl} (total connects: ${window.__nexusDebugStats__?.wsConnects})`);
  };

  sharedWs.onmessage = (e) => {
    dbgCount('wsMessagesIn');
    if (e.data instanceof ArrayBuffer) {
      dbg('ws', `binary frame ignored (${e.data.byteLength} bytes)`);
      return;
    }
    if (typeof e.data === "string") {
      dbg('ws', `← raw msg (${e.data.length} chars): ${e.data.slice(0, 120)}`);
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.event === "exit" && parsed.session_id) {
          dbgCount('exits');
          dbg('ws', `← EXIT session=${parsed.session_id}`);
          const cbs = wsListeners.get(`pty-exit:${parsed.session_id}`);
          if (!cbs || cbs.size === 0) dbgWarn('ws', `no exit listener for session=${parsed.session_id}`);
          cbs?.forEach((cb) => cb(undefined));
        } else if (parsed.event === "spawned" && parsed.session_id) {
          dbg('ws', `← SPAWNED session=${parsed.session_id}`);
          const cbs = wsListeners.get(`pty-spawned:${parsed.session_id}`);
          cbs?.forEach((cb) => cb(undefined));
        } else if (parsed.event === "error") {
          dbgError('ws', `← ERROR from server: ${parsed.error}`);
        } else if (parsed.event === "pty-output" && parsed.session_id && parsed.data) {
          const cbs = wsListeners.get(`pty-output:${parsed.session_id}`);
          const binString = atob(parsed.data);
          const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0));
          dbgCount('ptyOutputChunks');
          dbgCount('ptyOutputBytes', bytes.byteLength);
          dbg('pty', `← pty-output session=${parsed.session_id.slice(0,8)} bytes=${bytes.byteLength} listeners=${cbs?.size ?? 0}`);
          if (!cbs || cbs.size === 0) {
            dbgWarn('pty', `⚠ NO LISTENERS for pty-output:${parsed.session_id} — output will be LOST`);
          }
          cbs?.forEach((cb) => cb(Array.from(bytes)));
        } else {
          dbg('ws', `← unhandled event=${parsed.event}`);
        }
      } catch {
        dbgWarn('ws', `malformed JSON: ${e.data.slice(0, 80)}`);
      }
    }
  };

  sharedWs.onclose = (ev) => {
    dbgCount('wsDisconnects');
    dbg('ws', `✗ disconnected code=${ev.code} reason=${ev.reason || 'none'}`);
    sharedWsReady = false;
    sharedWs = null;
  };

  sharedWs.onerror = (ev) => {
    dbgError('ws', 'WebSocket error', ev);
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
    dbgCount('wsMessagesOut');
    dbgCount('spawns');
    dbg('spawn', `→ SPAWN session=${opts.sessionId.slice(0,8)} cmd=${opts.command || '<shell>'} cwd=${opts.cwd} wsState=${ws.readyState}`);

    const sendSpawn = () => {
      dbg('spawn', `→ sending spawn for session=${opts.sessionId.slice(0,8)}`);
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
      dbg('spawn', `WS not open (state=${ws.readyState}), waiting for onopen…`);
      ws.onopen = () => {
        sharedWsReady = true;
        dbg('ws', '✓ opened (from wsSpawn onopen)');
        sendSpawn();
      };
    }

    // Safety timeout — should never hit since we resolve after send
    setTimeout(() => {
      dbgWarn('spawn', `safety timeout hit for session=${opts.sessionId.slice(0,8)} — did WS connect?`);
      resolve();
    }, 3000);
  });
}

/** Write to PTY via WebSocket */
export function wsWrite(sessionId: string, data: Uint8Array): void {
  const ws = ensureSharedWs();
  if (ws.readyState === WebSocket.OPEN) {
    dbgCount('wsMessagesOut');
    dbg('pty', `→ write session=${sessionId.slice(0,8)} bytes=${data.byteLength}`);
    ws.send(
      JSON.stringify({
        type: "write",
        session_id: sessionId,
        data: base64Encode(data),
      })
    );
  } else {
    dbgWarn('pty', `write dropped — WS not open (state=${ws.readyState}) session=${sessionId.slice(0,8)}`);
  }
}

/** Resize PTY via WebSocket */
export function wsResize(sessionId: string, cols: number, rows: number): void {
  const ws = ensureSharedWs();
  if (ws.readyState === WebSocket.OPEN) {
    dbgCount('wsMessagesOut');
    dbg('pty', `→ resize session=${sessionId.slice(0,8)} ${cols}x${rows}`);
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
    dbgCount('wsMessagesOut');
    dbg('spawn', `→ kill session=${sessionId.slice(0,8)}`);
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
