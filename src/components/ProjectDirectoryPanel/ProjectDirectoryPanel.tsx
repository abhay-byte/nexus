import { useCallback, useEffect, useMemo, useState } from "react";
import { isTauri, httpApi } from "../../lib/api";
import { getImageDataUrl } from "../../lib/imageDataUrl";
import type { Project } from "../../types";

interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  children?: DirEntry[];
  expanded?: boolean;
  loaded?: boolean;
  error?: string;
}

interface ProjectDirectoryPanelProps {
  project: Project | null;
  collapsed: boolean;
  width: number;
  onToggleCollapse: () => void;
  onResizeWidth: (width: number) => void;
}

interface IconInfo {
  icon: string;
  color: string;
}

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico|tiff?)$/i;

function fileIcon(name: string, isDir: boolean): IconInfo {
  if (isDir) return { icon: "folder", color: "text-[#d19a66] dark:text-[#e5c07b]" };
  const lower = name.toLowerCase();
  if (IMAGE_EXTENSIONS.test(lower)) {
    if (/\.gif$/i.test(lower)) return { icon: "gif", color: "text-[#c678dd] dark:text-[#d670d6]" };
    return { icon: "image", color: "text-[#3b8eea] dark:text-[#61afef]" };
  }
  if (/\.(mp4|mov|avi|mkv|webm|flv|wmv)$/i.test(lower)) return { icon: "movie", color: "text-[#e06c75] dark:text-[#f14c4c]" };
  if (/\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(lower)) return { icon: "music_note", color: "text-[#98c379] dark:text-[#23d18b]" };
  if (/\.(zip|rar|7z|tar\.gz|tgz|tar|gz|bz2|xz|jar|war|ear|deb|rpm)$/i.test(lower)) return { icon: "folder_zip", color: "text-[#d19a66] dark:text-[#e5c07b]" };
  if (/\.pdf$/i.test(lower)) return { icon: "picture_as_pdf", color: "text-[#e06c75] dark:text-[#f14c4c]" };
  if (/\.(exe|so|dylib|dll|bin|app|sh|bat|cmd|ps1)$/i.test(lower)) return { icon: "terminal", color: "text-[#56b6c2] dark:text-[#29b8db]" };
  if (/\.(rs|ts|tsx|js|jsx|py|go|java|c|cpp|h|hpp|cs|rb|php|swift|kt|scala|lua|vim|elixir|ex|exs|erl|clj|groovy|dart|sql|graphql|yaml|yml|toml|ini|cfg|conf|json|xml|html|htm|css|scss|sass|less|md|markdown|rst|txt|log|csv|diff|patch)$/i.test(lower)) return { icon: "code", color: "text-[#98c379] dark:text-[#23d18b]" };
  if (/\.(ttf|otf|woff2?|eot)$/i.test(lower)) return { icon: "font_download", color: "text-[#c678dd] dark:text-[#d670d6]" };
  if (/\.(db|sqlite|sqlite3|mdb|accdb|parquet|orc|avro|protobuf|proto|msgpack)$/i.test(lower)) return { icon: "database", color: "text-[#e5c07b] dark:text-[#d19a66]" };
  return { icon: "description", color: "text-[#888] dark:text-[#abb2bf]" };
}

function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  return /\.(rs|ts|tsx|js|jsx|py|go|java|c|cpp|h|hpp|cs|rb|php|swift|kt|scala|lua|vim|elixir|ex|exs|erl|clj|groovy|dart|sql|graphql|yaml|yml|toml|ini|cfg|conf|json|xml|html|htm|css|scss|sass|less|md|markdown|rst|txt|log|csv|diff|patch)$/i.test(lower);
}

function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.test(name.toLowerCase());
}

async function readDir(path: string): Promise<DirEntry[]> {
  // Use HTTP API even in Tauri mode — the internal server uses raw Rust std::fs
  // which doesn't have Tauri plugin-fs scope restrictions on dot-directories.
  const entries = await httpApi.post<Array<{ name: string; isDirectory: boolean; isFile: boolean }>>(
    "/api/fs/read-dir",
    { path }
  );
  const results: DirEntry[] = entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory,
    isFile: entry.isFile,
    children: undefined,
  }));
  return results.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

function TreeNode({
  entry,
  prefix,
  onToggle,
  onDragStart,
  onContextMenu,
}: {
  entry: DirEntry;
  prefix: string;
  onToggle: (path: string) => void;
  onDragStart: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, name: string, isDirectory: boolean) => void;
}) {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  const { icon, color } = fileIcon(entry.name, entry.isDirectory);

  if (entry.isDirectory) {
    const hasChildren = entry.children && entry.children.length > 0;
    const isLoading = entry.expanded && entry.children === undefined;

    return (
      <div>
        <div
          className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-[#ffcc00]/20 select-none text-[#1a1a1a] dark:text-[#f5f0e8]"
          onClick={() => onToggle(path)}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", path);
            onDragStart(path);
          }}
          onContextMenu={(e) => onContextMenu(e, path, entry.name, true)}
        >
          <span className="material-symbols-outlined text-[13px] text-[#888]" style={{ fontSize: "13px" }}>
            {entry.loaded && !hasChildren ? "" : isLoading ? "hourglass" : entry.expanded ? "expand_more" : "chevron_right"}
          </span>
          <span className={`material-symbols-outlined text-[13px] ${color}`} style={{ fontSize: "13px" }}>
            {entry.expanded && entry.children !== undefined ? "folder_open" : icon}
          </span>
          <span className="font-mono text-[11px] truncate">{entry.name}</span>
          {isLoading && (
            <span className="material-symbols-outlined text-[10px] text-[#888] animate-spin" style={{ fontSize: "10px" }}>progress_activity</span>
          )}
          {entry.error && (
            <span className="font-mono text-[9px] text-[#e06c75] ml-1 truncate" title={entry.error}>{entry.error}</span>
          )}
          {entry.loaded && !hasChildren && !entry.error && (
            <span className="font-mono text-[9px] text-[#888] ml-1">empty</span>
          )}
        </div>
        {entry.expanded && hasChildren && (
          <div className="pl-3">
            {entry.children!.map((child) => (
              <TreeNode
                key={child.name}
                entry={child}
                prefix={path}
                onToggle={onToggle}
                onDragStart={onDragStart}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 cursor-grab hover:bg-[#ffcc00]/20 select-none text-[#1a1a1a] dark:text-[#f5f0e8]"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", path);
        e.dataTransfer.effectAllowed = "copy";
        onDragStart(path);
      }}
      onContextMenu={(e) => onContextMenu(e, path, entry.name, false)}
    >
      <span className="w-[13px] shrink-0" />
      <span className={`material-symbols-outlined text-[13px] ${color}`} style={{ fontSize: "13px" }}>
        {icon}
      </span>
      <span className="font-mono text-[11px] truncate">{entry.name}</span>
    </div>
  );
}

function flattenEntries(list: DirEntry[], prefix: string): Array<{ entry: DirEntry; path: string }> {
  const out: Array<{ entry: DirEntry; path: string }> = [];
  for (const entry of list) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    out.push({ entry, path });
    if (entry.children) {
      out.push(...flattenEntries(entry.children, path));
    }
  }
  return out;
}

export function ProjectDirectoryPanel({
  project,
  collapsed,
  width,
  onToggleCollapse,
  onResizeWidth,
}: ProjectDirectoryPanelProps) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    name: string;
    isDirectory: boolean;
  } | null>(null);

  const [textPreview, setTextPreview] = useState<{
    path: string;
    name: string;
    content: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [imagePreview, setImagePreview] = useState<{
    path: string;
    name: string;
    dataUrl: string | null;
  } | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  const projectPath = project?.path ?? null;

  // Helper: resolve full absolute path from a relative tree path
  const resolveFullPath = useCallback(
    (relativePath: string) => {
      const root = projectPath!.replace(/\\/g, "/").replace(/\/$/, "");
      return `${root}/${relativePath}`;
    },
    [projectPath],
  );

  // Helper: find a node in the tree by its relative path
  const findNode = useCallback(
    (relativePath: string): DirEntry | null => {
      const parts = relativePath.split("/");
      let current: DirEntry[] = entries;
      for (let i = 0; i < parts.length; i++) {
        const found = current.find((e) => e.name === parts[i]);
        if (!found) return null;
        if (i === parts.length - 1) return found;
        if (!found.children) return null;
        current = found.children;
      }
      return null;
    },
    [entries],
  );

  // Helper: mutate the tree state to attach children to a specific path
  const attachChildren = useCallback(
    (relativePath: string, children: DirEntry[], error?: string) => {
      if (relativePath === "") {
        setEntries(children);
        return;
      }
      setEntries((prev) => {
        const parts = relativePath.split("/");
        const updateNode = (list: DirEntry[], idx: number): DirEntry[] => {
          return list.map((entry) => {
            if (entry.name !== parts[idx]) return entry;
            if (idx === parts.length - 1) {
              return { ...entry, children, loaded: true, error: error ?? entry.error };
            }
            if (entry.children) {
              return { ...entry, children: updateNode(entry.children, idx + 1) };
            }
            return entry;
          });
        };
        return updateNode(prev, 0);
      });
    },
    [],
  );

  const load = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const result = await readDir(projectPath);
      setEntries(result);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  // Load children of a directory on demand
  const loadChildren = useCallback(
    async (relativePath: string) => {
      const fullPath = resolveFullPath(relativePath);
      try {
        const children = await readDir(fullPath);
        attachChildren(relativePath, children);
      } catch (err) {
        console.error(`Failed to read directory: ${fullPath}`, err);
        const msg = err instanceof Error ? err.message : String(err);
        attachChildren(relativePath, [], msg);
      }
    },
    [resolveFullPath, attachChildren],
  );

  useEffect(() => {
    if (!collapsed && projectPath) {
      void load();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, projectPath]);

  const togglePath = useCallback(
    (path: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });

      // Lazy load: if expanding a directory that hasn't been loaded yet
      const node = findNode(path);
      if (node && node.isDirectory && node.children === undefined) {
        void loadChildren(path);
      }
    },
    [findNode, loadChildren],
  );

  const buildVisibleTree = useCallback(
    (list: DirEntry[], prefix: string): DirEntry[] => {
      return list.map((entry) => {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        const copy = { ...entry };
        if (entry.isDirectory) {
          copy.expanded = expandedPaths.has(path);
          if (entry.children) {
            copy.children = buildVisibleTree(entry.children, path);
          }
        }
        return copy;
      });
    },
    [expandedPaths],
  );

  const visibleEntries = buildVisibleTree(entries, "");

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    const flat = flattenEntries(entries, "");
    return flat.filter(({ entry }) => entry.name.toLowerCase().includes(q));
  }, [entries, searchQuery]);

  const handleDragStart = useCallback((_path: string) => {}, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, path: string, name: string, isDirectory: boolean) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, path, name, isDirectory });
    },
    [],
  );

  const handleOpenInEditor = useCallback(
    async (relativePath: string) => {
      if (!project || !isTauri()) return;
      const fullPath = resolveFullPath(relativePath);
      try {
        const shell = await import("@tauri-apps/plugin-shell");
        await shell.open(fullPath);
      } catch (error) {
        console.error("Failed to open file:", error);
      }
      setContextMenu(null);
    },
    [project, resolveFullPath],
  );

  const handleTextPreview = useCallback(
    async (relativePath: string, name: string) => {
      if (!project) return;
      const fullPath = resolveFullPath(relativePath);
      setPreviewLoading(true);
      setContextMenu(null);
      try {
        const result = await httpApi.post<{ contents: string }>("/api/fs/read-text-file", { path: fullPath });
        setTextPreview({ path: relativePath, name, content: result.contents });
      } catch (error) {
        setTextPreview({ path: relativePath, name, content: `Error reading file: ${error instanceof Error ? error.message : String(error)}` });
      } finally {
        setPreviewLoading(false);
      }
    },
    [project, resolveFullPath],
  );

  const handleImagePreview = useCallback(
    async (relativePath: string, name: string) => {
      if (!project) return;
      const fullPath = resolveFullPath(relativePath);
      setImageLoading(true);
      setContextMenu(null);
      try {
        const dataUrl = await getImageDataUrl(fullPath);
        setImagePreview({ path: relativePath, name, dataUrl });
      } catch {
        setImagePreview({ path: relativePath, name, dataUrl: null });
      } finally {
        setImageLoading(false);
      }
    },
    [project, resolveFullPath],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const startX = e.clientX;
      const startWidth = width;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(160, Math.min(480, startWidth + delta));
        onResizeWidth(newWidth);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, onResizeWidth],
  );

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu]);

  const contextMenuFileName = contextMenu?.name ?? "";

  if (collapsed || !project) {
    return null;
  }

  return (
    <>
      <div
        className="nexus-project-panel relative flex flex-col border-r-2 border-[#ccc] dark:border-[#333] bg-[#f5f0e8] dark:bg-[#1a1a1a] shrink-0 overflow-hidden"
        style={{ width }}
        onClick={() => setContextMenu(null)}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b-2 border-[#ccc] dark:border-[#333] shrink-0 bg-[#e8e3da] dark:bg-[#0d0d0d]">
          <span className="font-['Space_Grotesk'] font-bold uppercase text-[10px] tracking-wide text-[#555] dark:text-[#888]">
            {project.name}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="material-symbols-outlined text-[#555] dark:text-[#888] hover:text-[#ffcc00] bg-transparent border-none cursor-pointer text-sm"
              onClick={() => void load()}
              title="Refresh"
              type="button"
            >
              refresh
            </button>
            <button
              className="material-symbols-outlined text-[#555] dark:text-[#888] hover:text-[#ffcc00] bg-transparent border-none cursor-pointer text-sm"
              onClick={onToggleCollapse}
              title="Hide project files"
              type="button"
            >
              chevron_left
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-2 py-1.5 border-b-2 border-[#ccc] dark:border-[#333] shrink-0">
          <div className="flex items-center gap-1 bg-white dark:bg-[#0d0d0d] border-2 border-[#1a1a1a] dark:border-[#333] px-2 py-1">
            <span className="material-symbols-outlined text-[12px] text-[#888]" style={{ fontSize: "12px" }}>search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files…"
              className="flex-1 min-w-0 bg-transparent border-none font-mono text-[10px] text-[#1a1a1a] dark:text-[#f5f0e8] placeholder:text-[#888] outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="material-symbols-outlined text-[12px] text-[#888] hover:text-[#e63b2e] bg-transparent border-none cursor-pointer"
                style={{ fontSize: "12px" }}
              >
                close
              </button>
            )}
          </div>
        </div>

        {/* Tree or search results */}
        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <span className="material-symbols-outlined text-sm animate-spin text-[#888]">sync</span>
            </div>
          ) : searchResults ? (
            searchResults.length === 0 ? (
              <div className="px-3 py-4 font-mono text-[10px] text-[#888] text-center">No matches</div>
            ) : (
              searchResults.map(({ entry, path }) => {
                const { icon, color } = fileIcon(entry.name, entry.isDirectory);
                return (
                  <div
                    key={path}
                    className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-[#ffcc00]/20 select-none text-[#1a1a1a] dark:text-[#f5f0e8]"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", path);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => {
                      if (entry.isDirectory) {
                        togglePath(path);
                      }
                    }}
                    onContextMenu={(e) => handleContextMenu(e, path, entry.name, entry.isDirectory)}
                  >
                    <span className={`material-symbols-outlined text-[13px] ${color}`} style={{ fontSize: "13px" }}>
                      {icon}
                    </span>
                    <span className="font-mono text-[10px] truncate opacity-80">{path}</span>
                  </div>
                );
              })
            )
          ) : (
            visibleEntries.map((entry) => (
              <TreeNode
                key={entry.name}
                entry={entry}
                prefix=""
                onToggle={togglePath}
                onDragStart={handleDragStart}
                onContextMenu={handleContextMenu}
              />
            ))
          )}
        </div>

        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#ffcc00] z-10"
          onMouseDown={handleMouseDown}
        />
      </div>

      {/* Context menu */}
      {contextMenu && !contextMenu.isDirectory && (
        <div
          className="fixed bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] p-2 flex flex-col z-[200] min-w-[180px] shadow-[8px_8px_0px_0px_#1a1a1a] dark:border-[#f5f0e8] dark:shadow-[8px_8px_0px_0px_#f5f0e8]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="w-full text-left font-['Space_Grotesk'] font-bold uppercase px-4 py-2 hover:bg-[#ffcc00] hover:text-[#1a1a1a] border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8]"
            onClick={() => handleOpenInEditor(contextMenu.path)}
            type="button"
          >
            Open in Editor
          </button>
          {isTextFile(contextMenuFileName) && (
            <button
              className="w-full text-left font-['Space_Grotesk'] font-bold uppercase px-4 py-2 hover:bg-[#ffcc00] hover:text-[#1a1a1a] border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8]"
              onClick={() => handleTextPreview(contextMenu.path, contextMenuFileName)}
              type="button"
            >
              Preview Text
            </button>
          )}
          {isImageFile(contextMenuFileName) && (
            <button
              className="w-full text-left font-['Space_Grotesk'] font-bold uppercase px-4 py-2 hover:bg-[#ffcc00] hover:text-[#1a1a1a] border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8]"
              onClick={() => handleImagePreview(contextMenu.path, contextMenuFileName)}
              type="button"
            >
              Preview Image
            </button>
          )}
        </div>
      )}

      {/* Text preview modal */}
      {textPreview && (
        <div
          className="fixed inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
          onClick={() => setTextPreview(null)}
        >
          <div
            className="w-full max-w-3xl bg-[#f5f0e8] dark:bg-[#1a1a1a] border-8 border-[#1a1a1a] dark:border-[#f5f0e8] flex flex-col shadow-[8px_8px_0px_0px_#1a1a1a] dark:shadow-[8px_8px_0px_0px_#f5f0e8] max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a] p-4 flex justify-between items-center shrink-0">
              <h3 className="font-['Space_Grotesk'] font-bold uppercase text-lg tracking-tighter truncate">
                {textPreview.name}
              </h3>
              <button
                className="material-symbols-outlined hover:text-[#e63b2e]"
                onClick={() => setTextPreview(null)}
                type="button"
              >
                close
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {previewLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="material-symbols-outlined animate-spin text-[#888]">sync</span>
                </div>
              ) : (
                <pre className="font-mono text-[11px] leading-relaxed text-[#1a1a1a] dark:text-[#f5f0e8] whitespace-pre-wrap break-words">
                  {textPreview.content}
                </pre>
              )}
            </div>
            <div className="p-4 border-t-4 border-[#1a1a1a] dark:border-[#f5f0e8] flex justify-end gap-3 shrink-0">
              <button
                className="px-6 py-2 font-black uppercase tracking-widest border-4 border-transparent hover:border-[#1a1a1a] dark:hover:border-[#f5f0e8] hover:bg-white dark:hover:bg-[#121212] transition-all text-[#1a1a1a] dark:text-[#f5f0e8]"
                onClick={() => setTextPreview(null)}
                type="button"
              >
                Close
              </button>
              <button
                className="bg-[#0055ff] text-white border-4 border-[#1a1a1a] dark:border-[#f5f0e8] px-6 py-2 font-black uppercase neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all"
                onClick={() => handleOpenInEditor(textPreview.path)}
                type="button"
              >
                Open in Editor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image preview modal */}
      {imagePreview && (
        <div
          className="fixed inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
          onClick={() => setImagePreview(null)}
        >
          <div
            className="w-full max-w-4xl bg-[#f5f0e8] dark:bg-[#1a1a1a] border-8 border-[#1a1a1a] dark:border-[#f5f0e8] flex flex-col shadow-[8px_8px_0px_0px_#1a1a1a] dark:shadow-[8px_8px_0px_0px_#f5f0e8] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a] p-4 flex justify-between items-center shrink-0">
              <h3 className="font-['Space_Grotesk'] font-bold uppercase text-lg tracking-tighter truncate">
                {imagePreview.name}
              </h3>
              <button
                className="material-symbols-outlined hover:text-[#e63b2e]"
                onClick={() => setImagePreview(null)}
                type="button"
              >
                close
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-[#0d0d0d]/20 dark:bg-[#2a2a2a]">
              {imageLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="material-symbols-outlined animate-spin text-[#888] text-2xl">sync</span>
                </div>
              ) : imagePreview.dataUrl ? (
                <img
                  src={imagePreview.dataUrl}
                  alt={imagePreview.name}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : (
                <div className="font-mono text-[#e06c75]">Failed to load image</div>
              )}
            </div>
            <div className="p-4 border-t-4 border-[#1a1a1a] dark:border-[#f5f0e8] flex justify-end gap-3 shrink-0">
              <button
                className="px-6 py-2 font-black uppercase tracking-widest border-4 border-transparent hover:border-[#1a1a1a] dark:hover:border-[#f5f0e8] hover:bg-white dark:hover:bg-[#121212] transition-all text-[#1a1a1a] dark:text-[#f5f0e8]"
                onClick={() => setImagePreview(null)}
                type="button"
              >
                Close
              </button>
              <button
                className="bg-[#0055ff] text-white border-4 border-[#1a1a1a] dark:border-[#f5f0e8] px-6 py-2 font-black uppercase neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all"
                onClick={() => handleOpenInEditor(imagePreview.path)}
                type="button"
              >
                Open in Editor
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
