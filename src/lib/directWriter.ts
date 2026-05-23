/**
 * Direct PTY → xterm.js writer registry.
 *
 * This module breaks the circular dependency between sessionStore and
 * TerminalView.  Active TerminalView instances register a callback here;
 * the sessionStore calls getDirectWriter() to write PTY output directly
 * to xterm.js without routing through the Zustand sessionLogs string.
 */

import { dbg, dbgWarn, dbgCount } from "./debug";

const directWriters = new Map<string, (chunk: Uint8Array) => void>();

/** Pre-mount output buffer: queues chunks that arrive before TerminalView registers a writer */
const preMountBuffers = new Map<string, Uint8Array[]>();

/** Register a direct writer for a session. Flushes any pre-mount buffered output immediately. */
export function registerDirectWriter(sessionId: string, writer: (chunk: Uint8Array) => void) {
  directWriters.set(sessionId, writer);
  dbg('writer', `registered directWriter for session=${sessionId.slice(0,8)}`);
  // Flush any output that arrived before this terminal mounted
  const buffered = preMountBuffers.get(sessionId);
  if (buffered && buffered.length > 0) {
    const totalBytes = buffered.reduce((acc, c) => acc + c.byteLength, 0);
    dbg('writer', `flushing ${buffered.length} pre-mount chunks (${totalBytes} bytes) → session=${sessionId.slice(0,8)}`);
    dbgCount('bufferFlushes');
    preMountBuffers.delete(sessionId);
    for (const chunk of buffered) {
      writer(chunk);
    }
  } else {
    dbg('writer', `no pre-mount buffer for session=${sessionId.slice(0,8)}`);
  }
}

/** Unregister a direct writer for a session. */
export function unregisterDirectWriter(sessionId: string) {
  directWriters.delete(sessionId);
  dbg('writer', `unregistered directWriter for session=${sessionId.slice(0,8)}`);
  // Clear any pre-mount buffer too (session is gone)
  preMountBuffers.delete(sessionId);
}

/** Get the direct writer for a session (if registered). */
export function getDirectWriter(sessionId: string) {
  return directWriters.get(sessionId);
}

/**
 * Queue output for a session that hasn't mounted its terminal yet.
 * Called by appendSessionOutput when no directWriter is registered.
 */
export function bufferPreMountOutput(sessionId: string, chunk: Uint8Array) {
  let buf = preMountBuffers.get(sessionId);
  if (!buf) {
    buf = [];
    preMountBuffers.set(sessionId, buf);
  }
  // Cap at 256 KB to avoid unbounded memory growth
  const totalSize = buf.reduce((acc, c) => acc + c.byteLength, 0);
  if (totalSize < 256 * 1024) {
    buf.push(chunk);
    dbgCount('bufferedChunks');
    dbg('writer', `buffered pre-mount chunk ${chunk.byteLength}B for session=${sessionId.slice(0,8)} (buf=${buf.length} chunks)`);
  } else {
    dbgWarn('writer', `pre-mount buffer full (>256KB) for session=${sessionId.slice(0,8)} — dropping chunk`);
  }
}
