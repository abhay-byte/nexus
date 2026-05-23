/**
 * useFileBrowser — fetches directory listings from /api/browse-dir
 * Works in browser mode (HTTP) and Tauri mode (via invoke or HTTP).
 */

import { useState, useCallback, useRef } from "react";
import { API_BASE } from "../../lib/api";

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number | null;
  modified: number | null;
}

export interface DirListing {
  path: string;
  parent: string | null;
  home: string;
  entries: DirEntry[];
}

type Status = "idle" | "loading" | "error";

export function useFileBrowser() {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const navigate = useCallback(async (path: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("loading");
    setError(null);

    try {
      const url = `${API_BASE}/api/browse-dir?path=${encodeURIComponent(path)}`;
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(msg.error || `HTTP ${res.status}`);
      }
      const data: DirListing = await res.json();
      setListing(data);
      setStatus("idle");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  const goUp = useCallback(() => {
    if (listing?.parent) void navigate(listing.parent);
  }, [listing, navigate]);

  return { listing, status, error, navigate, goUp };
}
