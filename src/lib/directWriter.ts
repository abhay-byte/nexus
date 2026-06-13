/**
 * Direct PTY → xterm.js writer registry.
 *
 * This module breaks the circular dependency between sessionStore and
 * TerminalView.  Active TerminalView instances register a callback here;
 * the sessionStore calls getDirectWriter() to write PTY output directly
 * to xterm.js without routing through the Zustand sessionLogs string.
 *
 * Writes are batched per animation frame so that bursts of PTY output
 * (e.g. `npm install`, `cat largefile`) collapse into a single xterm.js
 * write per frame.  This keeps the main thread responsive — the renderer
 * gets a chance to paint between frames and pending input events can be
 * processed instead of starving behind a flood of synchronous term.write
 * calls.
 */

import { dbg, dbgWarn, dbgCount } from "./debug";

const directWriters = new Map<string, (chunk: Uint8Array) => void>();

/** Pending chunks that arrived this animation frame, per session. */
const pendingWrites = new Map<string, Uint8Array[]>();

/** Pre-mount output buffer: queues chunks that arrive before TerminalView registers a writer */
const preMountBuffers = new Map<string, Uint8Array[]>();

/** Shared rAF handle — one flush per frame, regardless of session count. */
let flushHandle: number | null = null;

function scheduleFlush() {
  if (flushHandle !== null) return;
  flushHandle = requestAnimationFrame(flushPendingWrites);
}

function flushPendingWrites() {
  flushHandle = null;
  if (pendingWrites.size === 0) return;
  for (const [sessionId, chunks] of pendingWrites) {
    const writer = directWriters.get(sessionId);
    if (!writer) continue;
    const totalBytes = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    if (totalBytes === 0) continue;
    // Concatenate all chunks for this session into a single Uint8Array
    // so the writer makes exactly one term.write call per frame.
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const c of chunks) {
      combined.set(c, offset);
      offset += c.byteLength;
    }
    writer(combined);
  }
  pendingWrites.clear();
}

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
  pendingWrites.delete(sessionId);
  preMountBuffers.delete(sessionId);
  dbg('writer', `unregistered directWriter for session=${sessionId.slice(0,8)}`);
  // Clear any pre-mount buffer too (session is gone)
  preMountBuffers.delete(sessionId);
}

/** Get the direct writer for a session (if registered). */
export function getDirectWriter(sessionId: string) {
  return directWriters.get(sessionId);
}

/**
 * Queue a PTY chunk for the session.  The chunk will be delivered to the
 * registered writer in the next animation frame, coalesced with any other
 * chunks that arrived since the last frame.
 */
export function queueDirectWrite(sessionId: string, chunk: Uint8Array) {
  let queue = pendingWrites.get(sessionId);
  if (!queue) {
    queue = [];
    pendingWrites.set(sessionId, queue);
  }
  queue.push(chunk);
  scheduleFlush();
}

/**
 * Backward-compat path: write synchronously to the writer for a session
 * (used by sessionStore.appendSessionOutput, which still wants the
 * pre-batching behavior for direct dispatch when a writer is registered).
 * The batched path is queueDirectWrite above.
 */
export function writeDirect(sessionId: string, chunk: Uint8Array): boolean {
  const writer = directWriters.get(sessionId);
  if (writer) {
    writer(chunk);
    return true;
  }
  return false;
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
