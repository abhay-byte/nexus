/**
 * Nexus Debug Logger
 *
 * Lightweight, toggleable debug system covering the full agent output pipeline:
 *   WS connect → spawn → pty-output → directWriter → xterm.js
 *
 * Enable in browser console:
 *   window.__NEXUS_DEBUG__ = true
 *
 * Filter by namespace:
 *   window.__NEXUS_DEBUG__ = 'ws'      // only WS layer
 *   window.__NEXUS_DEBUG__ = 'pty'     // only PTY/session layer
 *   window.__NEXUS_DEBUG__ = 'writer'  // only directWriter layer
 *   window.__NEXUS_DEBUG__ = true      // all namespaces
 *
 * Disable:
 *   window.__NEXUS_DEBUG__ = false
 */

declare global {
  interface Window {
    __NEXUS_DEBUG__: boolean | string;
    __nexusDebugStats__: DebugStats;
  }
}

export type DebugNamespace = 'ws' | 'pty' | 'writer' | 'spawn' | 'rust';

export interface DebugStats {
  wsConnects: number;
  wsDisconnects: number;
  wsMessagesIn: number;
  wsMessagesOut: number;
  spawns: number;
  ptyOutputChunks: number;
  ptyOutputBytes: number;
  directWrites: number;
  bufferedChunks: number;
  bufferFlushes: number;
  exits: number;
  lastEvent: string;
  lastEventTime: number;
}

const stats: DebugStats = {
  wsConnects: 0,
  wsDisconnects: 0,
  wsMessagesIn: 0,
  wsMessagesOut: 0,
  spawns: 0,
  ptyOutputChunks: 0,
  ptyOutputBytes: 0,
  directWrites: 0,
  bufferedChunks: 0,
  bufferFlushes: 0,
  exits: 0,
  lastEvent: 'none',
  lastEventTime: 0,
};

// Expose stats globally for console inspection
if (typeof window !== 'undefined') {
  window.__nexusDebugStats__ = stats;
}

const COLORS: Record<DebugNamespace, string> = {
  ws:     '#4fc3f7', // light blue
  pty:    '#a5d6a7', // light green
  writer: '#ffcc80', // amber
  spawn:  '#ce93d8', // purple
  rust:   '#ef9a9a', // red (for rust-side events proxied via WS messages)
};

function isEnabled(ns: DebugNamespace): boolean {
  if (typeof window === 'undefined') return false;
  const flag = window.__NEXUS_DEBUG__;
  if (flag === true) return true;
  if (typeof flag === 'string') return flag === ns || flag === 'all';
  return false;
}

export function dbg(ns: DebugNamespace, message: string, ...args: unknown[]): void {
  if (!isEnabled(ns)) return;
  const color = COLORS[ns];
  const time = new Date().toISOString().slice(11, 23);
  console.log(
    `%c[nexus:${ns}]%c ${time} ${message}`,
    `color:${color};font-weight:bold`,
    'color:inherit',
    ...args,
  );
  stats.lastEvent = `[${ns}] ${message}`;
  stats.lastEventTime = Date.now();
}

export function dbgWarn(ns: DebugNamespace, message: string, ...args: unknown[]): void {
  if (!isEnabled(ns)) return;
  const time = new Date().toISOString().slice(11, 23);
  console.warn(`[nexus:${ns}] ${time} ⚠ ${message}`, ...args);
}

export function dbgError(ns: DebugNamespace, message: string, ...args: unknown[]): void {
  // Errors always log regardless of debug flag
  const time = new Date().toISOString().slice(11, 23);
  console.error(`[nexus:${ns}] ${time} ✖ ${message}`, ...args);
}

/** Increment a stats counter and return the new value */
export function dbgCount(key: keyof DebugStats, delta = 1): number {
  const val = (stats[key] as number) + delta;
  (stats as unknown as Record<string, number>)[key] = val;
  return val;
}

/** Print a pipeline summary table to console */
export function dbgStats(): void {
  console.table({ ...stats, lastEventTime: new Date(stats.lastEventTime).toISOString() });
}

// Expose dbgStats globally for quick console access
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__nexusStats = dbgStats;
}
