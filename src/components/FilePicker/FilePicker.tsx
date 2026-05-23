/**
 * FilePicker — an in-app file system browser/picker modal.
 *
 * Features:
 * - Works in all browsers (web mode) and Tauri mode
 * - Keyboard navigation: arrows, enter, backspace, type to filter
 * - Breadcrumb navigation + back button + sidebar quicklinks
 * - Shows hidden-file toggle, dir/file icons, sizes
 * - Neobrutalist design matching Nexus brand
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileBrowser, type DirEntry } from "./useFileBrowser";

// ── Utility ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
}

function buildBreadcrumbs(path: string): { label: string; path: string }[] {
  if (!path) return [];
  const parts = path.split("/").filter(Boolean);
  return [
    { label: "/", path: "/" },
    ...parts.map((part, i) => ({
      label: part,
      path: "/" + parts.slice(0, i + 1).join("/"),
    })),
  ];
}

// ── Icons ───────────────────────────────────────────────────────────────────

function FolderIcon({ symlink = false }: { symlink?: boolean }) {
  return (
    <span
      className="material-symbols-outlined text-base shrink-0"
      style={{ color: symlink ? "#0055ff" : "#ffcc00", fontSize: 18 }}
    >
      {symlink ? "folder_special" : "folder"}
    </span>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const iconMap: Record<string, string> = {
    ts: "javascript", tsx: "javascript", js: "javascript", jsx: "javascript",
    rs: "terminal", toml: "settings", json: "data_object", yaml: "data_object", yml: "data_object",
    md: "description", txt: "description", sh: "terminal", bash: "terminal",
    png: "image", jpg: "image", jpeg: "image", gif: "image", svg: "image", webp: "image",
    pdf: "picture_as_pdf", zip: "folder_zip", tar: "folder_zip", gz: "folder_zip",
  };
  return (
    <span className="material-symbols-outlined text-base shrink-0 opacity-60" style={{ fontSize: 18 }}>
      {iconMap[ext] ?? "draft"}
    </span>
  );
}

// ── Sidebar quicklinks ───────────────────────────────────────────────────────

const COMMON_DIRS = [
  { label: "Home", icon: "home", path: "~" },
  { label: "Desktop", icon: "desktop_windows", path: "~/Desktop" },
  { label: "Documents", icon: "folder_open", path: "~/Documents" },
  { label: "Downloads", icon: "download", path: "~/Downloads" },
  { label: "Projects", icon: "code", path: "~/repos" },
  { label: "Root", icon: "dns", path: "/" },
  { label: "Etc", icon: "settings", path: "/etc" },
  { label: "Opt", icon: "apps", path: "/opt" },
];

// ── Main component ───────────────────────────────────────────────────────────

interface FilePickerProps {
  /** Called with the selected absolute path */
  onSelect: (path: string) => void;
  onClose: () => void;
  /** Initial path to open. Defaults to ~ */
  initialPath?: string;
  /** If true, allow selecting files too (not just directories) */
  allowFiles?: boolean;
  /** If set, only show files with these extensions (e.g. ['png','jpg']). Dirs always shown. */
  allowedExtensions?: string[];
  title?: string;
}

export function FilePicker({
  onSelect,
  onClose,
  initialPath = "~",
  allowFiles = false,
  allowedExtensions,
  title = "Browse",
}: FilePickerProps) {
  const { listing, status, error, navigate, goUp } = useFileBrowser();
  const [filter, setFilter] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hasMounted = useRef(false);

  // Initial navigation
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      void navigate(initialPath);
    }
  }, [initialPath, navigate]);

  // Focus filter on mount
  useEffect(() => {
    filterRef.current?.focus();
  }, []);

  const entries = useMemo<DirEntry[]>(() => {
    if (!listing) return [];
    let list = listing.entries;
    if (!showHidden) {
      list = list.filter((e) => !e.name.startsWith("."));
    }
    if (!allowFiles) {
      list = list.filter((e) => e.is_dir);
    }
    if (allowFiles && allowedExtensions && allowedExtensions.length > 0) {
      // Keep all dirs, filter files by extension
      list = list.filter((e) => {
        if (e.is_dir) return true;
        const ext = e.name.split(".").pop()?.toLowerCase() ?? "";
        return allowedExtensions.includes(ext);
      });
    }
    if (filter.trim()) {
      const q = filter.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    return list;
  }, [listing, filter, showHidden, allowFiles, allowedExtensions]);

  // Reset active index when entries change
  useEffect(() => {
    setActiveIdx(0);
  }, [entries.length, listing?.path]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const open = useCallback((entry: DirEntry) => {
    if (entry.is_dir) {
      setFilter("");
      void navigate(entry.path);
    } else {
      setSelectedPath(entry.path);
    }
  }, [navigate]);

  const handleSelect = useCallback(() => {
    const path = selectedPath ?? listing?.path ?? null;
    if (path) onSelect(path);
  }, [selectedPath, listing, onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, entries.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (entries[activeIdx]) open(entries[activeIdx]);
        else handleSelect();
        break;
      case "Backspace":
        if (filter === "") {
          e.preventDefault();
          goUp();
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }, [activeIdx, entries, filter, goUp, handleSelect, onClose, open]);

  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(listing?.path ?? ""),
    [listing?.path]
  );

  const currentDisplayPath = listing?.path ?? "";
  const canSelectCurrent = !selectedPath && listing?.path;

  return (
    <div
      className="fixed inset-0 z-[200] bg-[#1a1a1a]/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-4xl bg-[#f5f0e8] dark:bg-[#1a1a1a] border-8 border-[#1a1a1a] dark:border-[#f5f0e8] shadow-[8px_8px_0px_0px_#1a1a1a] dark:shadow-[8px_8px_0px_0px_#f5f0e8] flex flex-col font-['Space_Grotesk']"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* ── Header ── */}
        <div className="bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a] px-5 py-4 flex items-center gap-3 shrink-0">
          <span className="material-symbols-outlined text-[#ffcc00] dark:text-[#1a1a1a]">
            folder_open
          </span>
          <h2 className="font-black uppercase text-xl tracking-tight flex-1">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="material-symbols-outlined hover:text-[#e63b2e] transition-colors"
            aria-label="Close"
          >
            close
          </button>
        </div>

        {/* ── Breadcrumb bar ── */}
        <div className="bg-white dark:bg-[#111] border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] px-4 py-2 flex items-center gap-1 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={goUp}
            className="material-symbols-outlined text-base p-1 rounded hover:bg-[#ffcc00] hover:text-[#1a1a1a] transition-colors shrink-0"
            aria-label="Go up"
            disabled={!listing?.parent}
          >
            arrow_upward
          </button>
          <div className="flex items-center flex-nowrap min-w-0 overflow-x-auto text-sm font-mono">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.path} className="flex items-center shrink-0">
                {i > 0 && (
                  <span className="opacity-30 mx-1 text-xs">/</span>
                )}
                <button
                  type="button"
                  onClick={() => void navigate(crumb.path)}
                  className={`px-1.5 py-0.5 rounded font-mono text-xs transition-colors hover:bg-[#ffcc00] hover:text-[#1a1a1a] ${
                    i === breadcrumbs.length - 1
                      ? "font-bold text-[#1a1a1a] dark:text-[#f5f0e8]"
                      : "opacity-60 text-[#1a1a1a] dark:text-[#f5f0e8]"
                  }`}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* ── Body: sidebar + listing ── */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-40 shrink-0 border-r-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#111] overflow-y-auto flex flex-col gap-0.5 p-2">
            <p className="uppercase text-[9px] font-black tracking-widest opacity-40 px-2 pt-1 pb-0.5">
              Quick Links
            </p>
            {COMMON_DIRS.map((dir) => (
              <button
                key={dir.path}
                type="button"
                onClick={() => {
                  setFilter("");
                  void navigate(dir.path);
                }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs font-medium transition-colors w-full hover:bg-[#ffcc00] hover:text-[#1a1a1a] ${
                  listing?.path === dir.path
                    ? "bg-[#ffcc00] text-[#1a1a1a] font-bold"
                    : "text-[#1a1a1a] dark:text-[#f5f0e8]"
                }`}
              >
                <span className="material-symbols-outlined text-sm shrink-0" style={{ fontSize: 16 }}>
                  {dir.icon}
                </span>
                <span className="truncate">{dir.label}</span>
              </button>
            ))}
            <div className="mt-auto pt-2 border-t-2 border-[#1a1a1a]/10 dark:border-[#f5f0e8]/10">
              <button
                type="button"
                onClick={() => setShowHidden((v) => !v)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs font-medium w-full transition-colors ${
                  showHidden
                    ? "bg-[#1a1a1a] text-white dark:bg-[#f5f0e8] dark:text-[#1a1a1a]"
                    : "text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-[#ffcc00] hover:text-[#1a1a1a]"
                }`}
              >
                <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16 }}>
                  visibility
                </span>
                Hidden
              </button>
            </div>
          </div>

          {/* Main listing */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Search/filter */}
            <div className="px-4 pt-3 pb-2 shrink-0 flex gap-2 items-center border-b-2 border-[#1a1a1a]/10 dark:border-[#f5f0e8]/10">
              <span className="material-symbols-outlined text-base opacity-40" style={{ fontSize: 18 }}>
                search
              </span>
              <input
                ref={filterRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Filter…"
                className="flex-1 bg-transparent font-mono text-sm outline-none text-[#1a1a1a] dark:text-[#f5f0e8] placeholder:opacity-30"
                aria-label="Filter directory entries"
                id="filepicker-filter"
                autoComplete="off"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  className="material-symbols-outlined text-base opacity-40 hover:opacity-100 transition-opacity"
                  style={{ fontSize: 16 }}
                  aria-label="Clear filter"
                >
                  close
                </button>
              )}
            </div>

            {/* Entries list */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto"
              role="listbox"
              aria-label="Directory contents"
            >
              {status === "loading" && (
                <div className="flex flex-col items-center justify-center h-32 gap-3">
                  <span className="material-symbols-outlined text-3xl animate-spin opacity-30">
                    sync
                  </span>
                  <p className="text-xs font-mono opacity-40">Loading…</p>
                </div>
              )}

              {status === "error" && (
                <div className="flex flex-col items-center justify-center h-32 gap-2 px-6 text-center">
                  <span className="material-symbols-outlined text-2xl text-[#e63b2e]">
                    error
                  </span>
                  <p className="text-xs font-mono text-[#e63b2e]">{error}</p>
                </div>
              )}

              {status === "idle" && entries.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 gap-2 opacity-40">
                  <span className="material-symbols-outlined text-2xl">
                    {filter ? "search_off" : "folder_off"}
                  </span>
                  <p className="text-xs font-mono">
                    {filter ? "No matches" : "Empty directory"}
                  </p>
                </div>
              )}

              {status === "idle" &&
                entries.map((entry, i) => {
                  const isActive = i === activeIdx;
                  const isSelected =
                    selectedPath === entry.path ||
                    (!selectedPath && !entry.is_dir && false); // only dirs auto-select

                  return (
                    <button
                      key={entry.path}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left border-b border-[#1a1a1a]/5 dark:border-[#f5f0e8]/5 transition-colors ${
                        isSelected
                          ? "bg-[#0055ff] text-white"
                          : isActive
                          ? "bg-[#ffcc00] text-[#1a1a1a]"
                          : "hover:bg-[#f5f0e8] dark:hover:bg-[#2a2a2a] text-[#1a1a1a] dark:text-[#f5f0e8]"
                      }`}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => open(entry)}
                      onDoubleClick={() => {
                        if (!entry.is_dir && allowFiles) onSelect(entry.path);
                      }}
                    >
                      {entry.is_dir ? (
                        <FolderIcon symlink={entry.is_symlink} />
                      ) : (
                        <FileIcon name={entry.name} />
                      )}
                      <span className="flex-1 font-mono text-sm truncate">
                        {entry.name}
                        {entry.is_dir && (
                          <span className="opacity-30">/</span>
                        )}
                        {entry.is_symlink && (
                          <span className="ml-1 text-[10px] opacity-50">→</span>
                        )}
                      </span>
                      {entry.size !== null && (
                        <span className="text-[10px] font-mono opacity-40 shrink-0">
                          {formatSize(entry.size)}
                        </span>
                      )}
                      {entry.is_dir && (
                        <span
                          className="material-symbols-outlined shrink-0 opacity-30"
                          style={{ fontSize: 16 }}
                        >
                          chevron_right
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* Current path display */}
            {listing && (
              <div className="border-t-2 border-[#1a1a1a]/10 dark:border-[#f5f0e8]/10 px-4 py-2 flex items-center gap-2 bg-white/50 dark:bg-[#111]/50 shrink-0">
                <span className="material-symbols-outlined text-sm opacity-40" style={{ fontSize: 14 }}>
                  folder
                </span>
                <code className="text-xs font-mono opacity-60 flex-1 truncate">
                  {selectedPath ?? currentDisplayPath}
                </code>
                {selectedPath && (
                  <button
                    type="button"
                    onClick={() => setSelectedPath(null)}
                    className="text-[10px] font-mono opacity-40 hover:opacity-100 transition-opacity"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#f5f0e8] dark:bg-[#1a1a1a] px-5 py-3 flex items-center justify-between gap-4 shrink-0">
          <div className="flex gap-2 text-xs font-mono opacity-40 items-center">
            <kbd className="border border-current px-1 rounded">↑↓</kbd> navigate
            <kbd className="border border-current px-1 rounded ml-1">↵</kbd> open
            <kbd className="border border-current px-1 rounded ml-1">⌫</kbd> up
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 font-black uppercase text-sm border-4 border-transparent hover:border-[#1a1a1a] dark:hover:border-[#f5f0e8] transition-all text-[#1a1a1a] dark:text-[#f5f0e8]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSelect}
              disabled={!canSelectCurrent && !selectedPath}
              className="bg-[#0055ff] text-white border-4 border-[#1a1a1a] dark:border-[#f5f0e8] px-6 py-2.5 font-black uppercase text-sm shadow-[4px_4px_0px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_0px_#f5f0e8] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-[4px_4px_0px_0px_#1a1a1a] dark:disabled:shadow-[4px_4px_0px_0px_#f5f0e8]"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
