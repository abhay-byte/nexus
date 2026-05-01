/**
 * Direct PTY → xterm.js writer registry.
 *
 * This module breaks the circular dependency between sessionStore and
 * TerminalView.  Active TerminalView instances register a callback here;
 * the sessionStore calls getDirectWriter() to write PTY output directly
 * to xterm.js without routing through the Zustand sessionLogs string.
 */

const directWriters = new Map<string, (chunk: Uint8Array) => void>();

/** Register a direct writer for a session. */
export function registerDirectWriter(sessionId: string, writer: (chunk: Uint8Array) => void) {
  directWriters.set(sessionId, writer);
}

/** Unregister a direct writer for a session. */
export function unregisterDirectWriter(sessionId: string) {
  directWriters.delete(sessionId);
}

/** Get the direct writer for a session (if registered). */
export function getDirectWriter(sessionId: string) {
  return directWriters.get(sessionId);
}
