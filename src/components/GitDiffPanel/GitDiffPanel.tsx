import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import type { Project } from "../../types";

// ── Types ────────────────────────────────────────────────────────────────────

interface GitDiffLine {
  old_line: number | null;
  new_line: number | null;
  kind: "context" | "added" | "removed";
  content: string;
}

interface GitDiffHunk {
  header: string;
  lines: GitDiffLine[];
}

interface GitChangedFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: GitDiffHunk[];
  is_binary: boolean;
}

interface GitDiffResult {
  branch: string;
  files: GitChangedFile[];
  total_additions: number;
  total_deletions: number;
}

interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
}

interface GitDiffPanelProps {
  open: boolean;
  project: Project | null;
  onClose: () => void;
}

// ── File type detection ──────────────────────────────────────────────────────

type FileCategory =
  | "image"
  | "gif"
  | "video"
  | "audio"
  | "archive"
  | "executable"
  | "directory"
  | "pdf"
  | "code"
  | "data"
  | "font"
  | "binary"
  | "text";

interface FileTypeInfo {
  category: FileCategory;
  icon: string;
  label: string;
}

function getFileTypeInfo(path: string): FileTypeInfo {
  const lower = path.toLowerCase().replace(/\\/g, "/");
  const name = lower.split("/").pop() ?? lower;

  // Directory
  if (path.endsWith("/") || (!name.includes(".") && !path.includes("."))) {
    return { category: "directory", icon: "folder", label: "Directory" };
  }

  // Image
  if (/\.(png|jpg|jpeg|bmp|webp|svg|ico|tiff?)$/i.test(name)) {
    return { category: "image", icon: "image", label: "Image" };
  }

  // GIF
  if (/\.gif$/i.test(name)) {
    return { category: "gif", icon: "gif", label: "GIF" };
  }

  // Video
  if (/\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|mpeg?)$/i.test(name)) {
    return { category: "video", icon: "movie", label: "Video" };
  }

  // Audio
  if (/\.(mp3|wav|flac|aac|ogg|m4a|wma)$/i.test(name)) {
    return { category: "audio", icon: "music_note", label: "Audio" };
  }

  // Archive
  if (/\.(zip|rar|7z|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz|txz|tar|gz|bz2|xz|lz4|lzma|br|deb|rpm|dmg|pkg|msi|jar|war|ear)$/i.test(name)) {
    return { category: "archive", icon: "folder_zip", label: "Archive" };
  }

  // PDF
  if (/\.pdf$/i.test(name)) {
    return { category: "pdf", icon: "picture_as_pdf", label: "PDF" };
  }

  // Executable
  if (/\.(exe|dll|so|dylib|bin|app|bat|cmd|sh|bash|zsh|fish|ps1)$/i.test(name)) {
    return { category: "executable", icon: "terminal", label: "Executable" };
  }

  // Code / text source
  if (/\.(rs|ts|tsx|js|jsx|py|go|java|c|cpp|h|hpp|cs|rb|php|swift|kt|scala|rs|lua|vim|elixir|ex|exs|erl|hrl|clj|cljs|cljs|groovy|gradle|dart|flutter|sql|graphql|yaml|yml|toml|ini|cfg|conf|json|xml|html|htm|css|scss|sass|less|md|markdown|rst|txt|log|csv|tsv|diff|patch)$/i.test(name)) {
    return { category: "code", icon: "code", label: "Code" };
  }

  // Font
  if (/\.(ttf|otf|woff2?|eot)$/i.test(name)) {
    return { category: "font", icon: "font_download", label: "Font" };
  }

  // Data
  if (/\.(db|sqlite|sqlite3|mdb|accdb|fdb|gdb|odb|csv|tsv|json|xml|parquet|orc|avro|protobuf|proto|msgpack)$/i.test(name)) {
    return { category: "data", icon: "database", label: "Data" };
  }

  // Fallback binary / text
  return { category: "binary", icon: "memory", label: "Binary" };
}

function isPreviewable(category: FileCategory): boolean {
  return category === "image" || category === "gif";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusLabel(status: string) {
  switch (status) {
    case "added":    return { label: "ADD", bg: "bg-[#00aa55]" };
    case "deleted":  return { label: "DEL", bg: "bg-[#e63b2e]" };
    case "renamed":  return { label: "REN", bg: "bg-[#0055ff]" };
    default:         return { label: "MOD", bg: "bg-[#1a1a1a] dark:bg-[#f5f0e8] dark:text-[#1a1a1a]" };
  }
}

function basename(path: string) {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

// ── Branch dropdown ──────────────────────────────────────────────────────────

function BranchDropdown({
  current,
  branches,
  onSwitch,
  disabled,
}: {
  current: string;
  branches: GitBranch[];
  onSwitch: (name: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className="flex items-center gap-1 border-2 border-[#1a1a1a] dark:border-[#f5f0e8] px-2 py-1 font-mono text-xs font-bold bg-[#1a1a1a] dark:bg-[#f5f0e8] text-[#ffcc00] dark:text-[#1a1a1a] hover:bg-[#ffcc00] hover:text-[#1a1a1a] dark:hover:bg-[#ffcc00] transition-none disabled:opacity-50 max-w-[160px]"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title={current}
      >
        <span className="material-symbols-outlined text-sm" style={{ fontSize: "14px" }}>
          account_tree
        </span>
        <span className="truncate">{current}</span>
        <span className="material-symbols-outlined text-sm shrink-0" style={{ fontSize: "14px" }}>
          expand_more
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-[100] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#f5f0e8] dark:bg-[#1a1a1a] shadow-[4px_4px_0px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_0px_#f5f0e8] min-w-[200px] max-h-64 overflow-y-auto">
          {branches.length === 0 && (
            <div className="p-3 font-mono text-xs opacity-60 dark:text-[#f5f0e8]">No branches found</div>
          )}
          {branches.map((b) => (
            <div
              key={b.name}
              onClick={() => {
                if (!b.current && !b.remote) {
                  onSwitch(b.name);
                }
                setOpen(false);
              }}
              className={`flex items-center gap-2 px-3 py-2 font-mono text-xs cursor-pointer border-b-2 border-[#1a1a1a] dark:border-[#f5f0e8] last:border-b-0 transition-none dark:text-[#f5f0e8] ${
                b.current
                  ? "bg-[#ffcc00] text-[#1a1a1a] dark:bg-[#ffcc00] dark:text-[#1a1a1a] font-black"
                  : b.remote
                  ? "opacity-50 cursor-default"
                  : "hover:bg-[#ffcc00] hover:text-[#1a1a1a] dark:hover:bg-[#ffcc00] dark:hover:text-[#1a1a1a]"
              }`}
            >
              {b.current && (
                <span className="material-symbols-outlined text-sm" style={{ fontSize: "12px" }}>
                  check
                </span>
              )}
              {b.remote && (
                <span className="material-symbols-outlined text-sm" style={{ fontSize: "12px" }}>
                  cloud
                </span>
              )}
              <span className="truncate">{b.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── File Preview ─────────────────────────────────────────────────────────────

const FilePreview = memo(function FilePreview({
  file,
  projectPath,
}: {
  file: GitChangedFile;
  projectPath: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeInfo = useMemo(() => getFileTypeInfo(file.path), [file.path]);

  useEffect(() => {
    if (!isPreviewable(typeInfo.category)) return;
    if (file.status === "deleted") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const root = projectPath.replace(/[\\/]+$/, "");
        const fullPath = `${root}/${file.path}`;
        const bytes = await readFile(fullPath);
        if (cancelled) return;
        const blob = new Blob([bytes]);
        const url = URL.createObjectURL(blob);
        if (!cancelled) {
          setPreviewUrl(url);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [file.path, file.status, projectPath, typeInfo.category]);

  // Deleted file
  if (file.status === "deleted") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 font-mono text-xs opacity-50 dark:text-[#f5f0e8]">
        <span className="material-symbols-outlined text-5xl">delete_forever</span>
        <span>File deleted</span>
      </div>
    );
  }

  // Directory
  if (typeInfo.category === "directory") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 font-mono text-xs opacity-50 dark:text-[#f5f0e8]">
        <span className="material-symbols-outlined text-5xl">folder</span>
        <span>Directory</span>
      </div>
    );
  }

  // Image / GIF preview
  if (isPreviewable(typeInfo.category)) {
    if (loading) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <span className="material-symbols-outlined text-4xl animate-spin text-[#1a1a1a] dark:text-[#f5f0e8]">sync</span>
          <p className="font-mono text-xs uppercase tracking-wide dark:text-[#f5f0e8]">Loading preview…</p>
        </div>
      );
    }

    if (error || !previewUrl) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 font-mono text-xs opacity-50 dark:text-[#f5f0e8]">
          <span className="material-symbols-outlined text-5xl">{typeInfo.icon}</span>
          <span>{typeInfo.label} — preview unavailable</span>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        {typeInfo.category === "gif" ? (
          <img src={previewUrl} alt={file.path} className="max-w-full max-h-full object-contain border-4 border-[#1a1a1a] dark:border-[#f5f0e8]" />
        ) : (
          <img src={previewUrl} alt={file.path} className="max-w-full max-h-full object-contain border-4 border-[#1a1a1a] dark:border-[#f5f0e8]" />
        )}
      </div>
    );
  }

  // Video
  if (typeInfo.category === "video") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 font-mono text-xs opacity-50 dark:text-[#f5f0e8]">
        <span className="material-symbols-outlined text-5xl">{typeInfo.icon}</span>
        <span>{typeInfo.label}</span>
      </div>
    );
  }

  // Audio
  if (typeInfo.category === "audio") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 font-mono text-xs opacity-50 dark:text-[#f5f0e8]">
        <span className="material-symbols-outlined text-5xl">{typeInfo.icon}</span>
        <span>{typeInfo.label}</span>
      </div>
    );
  }

  // Archive
  if (typeInfo.category === "archive") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 font-mono text-xs opacity-50 dark:text-[#f5f0e8]">
        <span className="material-symbols-outlined text-5xl">{typeInfo.icon}</span>
        <span>{typeInfo.label}</span>
      </div>
    );
  }

  // PDF
  if (typeInfo.category === "pdf") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 font-mono text-xs opacity-50 dark:text-[#f5f0e8]">
        <span className="material-symbols-outlined text-5xl">{typeInfo.icon}</span>
        <span>{typeInfo.label}</span>
      </div>
    );
  }

  // Executable
  if (typeInfo.category === "executable") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 font-mono text-xs opacity-50 dark:text-[#f5f0e8]">
        <span className="material-symbols-outlined text-5xl">{typeInfo.icon}</span>
        <span>{typeInfo.label}</span>
      </div>
    );
  }

  // Code / text (no hunks = empty)
  if (typeInfo.category === "code") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 font-mono text-xs opacity-50 dark:text-[#f5f0e8]">
        <span className="material-symbols-outlined text-5xl">{typeInfo.icon}</span>
        <span>{file.status === "added" ? "New file (empty)" : "No diff available"}</span>
      </div>
    );
  }

  // Generic binary
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 font-mono text-xs opacity-50 dark:text-[#f5f0e8]">
      <span className="material-symbols-outlined text-5xl">{typeInfo.icon}</span>
      <span>{typeInfo.label}</span>
    </div>
  );
});

// ── Diff Table ───────────────────────────────────────────────────────────────

const DiffView = memo(function DiffView({
  file,
  projectPath,
}: {
  file: GitChangedFile;
  projectPath: string;
}) {
  if (file.hunks.length === 0 || file.is_binary) {
    return <FilePreview file={file} projectPath={projectPath} />;
  }

  return (
    <div className="flex-1 overflow-auto font-mono text-[11px] leading-tight">
      <table className="w-full border-collapse">
        <tbody>
          {file.hunks.map((hunk, hi) => (
            <tr key={`group-${hi}`}>
              <td className="p-0" colSpan={3}>
                <table className="w-full border-collapse">
                  <tbody>
                    <tr className="bg-[#0055ff]/10 dark:bg-[#0055ff]/20">
                      <td colSpan={3} className="px-2 py-0.5 font-mono text-[10px] text-[#0055ff] dark:text-[#88aaff] font-bold border-b border-[#0055ff]/30 select-none">
                        {hunk.header}
                      </td>
                    </tr>
                    {hunk.lines.map((line, li) => {
                      const isAdded   = line.kind === "added";
                      const isRemoved = line.kind === "removed";
                      return (
                        <tr
                          key={`${hi}-${li}`}
                          className={`${
                            isAdded   ? "bg-[#00aa55]/10 dark:bg-[#00aa55]/20" :
                            isRemoved ? "bg-[#e63b2e]/10 dark:bg-[#e63b2e]/20" :
                                        "bg-white dark:bg-[#1a1a1a]"
                          }`}
                        >
                          <td className={`w-8 text-center text-[10px] select-none border-r border-[#1a1a1a]/10 dark:border-[#f5f0e8]/10 ${
                            isRemoved ? "text-[#e63b2e] font-bold bg-[#e63b2e]/20 dark:bg-[#e63b2e]/30" : "text-[#1a1a1a]/30 dark:text-[#f5f0e8]/30"
                          }`}>
                            {line.old_line ?? ""}
                          </td>
                          <td className={`w-8 text-center text-[10px] select-none border-r border-[#1a1a1a]/10 dark:border-[#f5f0e8]/10 ${
                            isAdded ? "text-[#00aa55] font-bold bg-[#00aa55]/20 dark:bg-[#00aa55]/30" : "text-[#1a1a1a]/30 dark:text-[#f5f0e8]/30"
                          }`}>
                            {line.new_line ?? ""}
                          </td>
                          <td className={`pl-2 pr-4 py-0.5 whitespace-pre-wrap break-all ${
                            isAdded   ? "text-[#1a4a1a] dark:text-[#aaffaa]" :
                            isRemoved ? "text-[#4a1a1a] dark:text-[#ffaaaa]" :
                                        "text-[#1a1a1a] dark:text-[#f5f0e8]"
                          }`}>
                            <span className={`mr-2 select-none font-bold ${isAdded ? "text-[#00aa55]" : isRemoved ? "text-[#e63b2e]" : "opacity-0"}`}>
                              {isAdded ? "+" : isRemoved ? "−" : "+"}
                            </span>
                            {line.content}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

// ── File list item ───────────────────────────────────────────────────────────

function FileListItem({
  file,
  active,
  onClick,
}: {
  file: GitChangedFile;
  active: boolean;
  onClick: () => void;
}) {
  const { label, bg } = statusLabel(file.status);
  const typeInfo = useMemo(() => getFileTypeInfo(file.path), [file.path]);

  return (
    <div
      onClick={onClick}
      className={`px-3 py-3 border-b-2 border-[#1a1a1a] dark:border-[#f5f0e8] flex justify-between items-start cursor-pointer transition-none ${
        active
          ? "bg-[#ffcc00] text-[#1a1a1a]"
          : "hover:bg-white dark:hover:bg-[#1a1a1a] dark:text-[#f5f0e8]"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[13px] opacity-60 shrink-0" style={{ fontSize: "13px" }}>
            {typeInfo.icon}
          </span>
          <div className="font-mono text-[11px] font-bold truncate">{basename(file.path)}</div>
        </div>
        <div className="font-mono text-[9px] opacity-50 truncate mt-0.5">{file.path}</div>
        <div className="flex gap-1 mt-1 font-mono text-[9px]">
          <span className="text-[#00aa55]">+{file.additions}</span>
          <span className="text-[#e63b2e]">-{file.deletions}</span>
        </div>
      </div>
      <span className={`${bg} text-white text-[8px] font-black px-1 py-0.5 ml-1 shrink-0`}>
        {label}
      </span>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export const GitDiffPanel = memo(function GitDiffPanel({ open, project, onClose }: GitDiffPanelProps) {
  const [diffResult, setDiffResult] = useState<GitDiffResult | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileDetails, setFileDetails] = useState<Record<string, GitChangedFile>>({});
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const fetchDiff = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    setError(null);
    try {
      const [result, branchList] = await Promise.all([
        invoke<GitDiffResult>("git_diff", { cwd: project.path }),
        invoke<GitBranch[]>("git_branches", { cwd: project.path }),
      ]);
      setDiffResult(result);
      setBranches(branchList);
      setFileDetails({});
      setFileError(null);
      if (result.files.length > 0) {
        setSelectedFilePath((prev) => {
          const stillExists = result.files.find((f) => f.path === prev);
          return stillExists?.path ?? result.files[0].path;
        });
      } else {
        setSelectedFilePath(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => {
    if (!open || !project || !selectedFilePath || fileDetails[selectedFilePath]) {
      return;
    }

    let cancelled = false;
    setFileLoading(true);
    setFileError(null);

    void invoke<GitChangedFile>("git_diff_file", { cwd: project.path, path: selectedFilePath })
      .then((file) => {
        if (cancelled) {
          return;
        }
        setFileDetails((prev) => ({ ...prev, [file.path]: file }));
      })
      .catch((e) => {
        if (!cancelled) {
          setFileError(String(e));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFileLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileDetails, open, project, selectedFilePath]);

  // Refresh on open or project change
  useEffect(() => {
    if (open && project) {
      void fetchDiff();
    }
  }, [open, project, fetchDiff]);

  const handleSwitchBranch = async (branchName: string) => {
    if (!project) return;
    setSwitching(true);
    try {
      await invoke("git_checkout_branch", { cwd: project.path, branch: branchName });
      await fetchDiff();
    } catch (e) {
      setError(String(e));
    } finally {
      setSwitching(false);
    }
  };

  const currentBranch = diffResult?.branch ?? branches.find((b) => b.current)?.name ?? "main";
  const selectedFileSummary = useMemo(
    () => diffResult?.files.find((file) => file.path === selectedFilePath) ?? null,
    [diffResult, selectedFilePath],
  );
  const selectedFile = selectedFilePath ? fileDetails[selectedFilePath] ?? selectedFileSummary : null;

  return (
    <div
      className={`fixed inset-0 z-[70] flex justify-start transition-all duration-300 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-[#1a1a1a]/40 dark:bg-black/80 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`relative w-full max-w-4xl bg-[#f5f0e8] dark:bg-[#0e0e0e] border-r-8 border-[#1a1a1a] dark:border-[#f5f0e8] h-full shadow-2xl flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* ── Panel Header ─────────────────────────────────────────────────── */}
        <div className="p-6 border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#ffcc00] dark:bg-[#ffcc00] flex justify-between items-start shrink-0 text-[#1a1a1a]">
          <div className="flex-1 min-w-0">
            <h1 className="font-['Space_Grotesk'] font-black text-5xl leading-none tracking-tighter text-[#1a1a1a] uppercase mb-2">
              DIFF_VIEW
            </h1>
            <div className="flex flex-wrap gap-3 items-center">
              {/* Branch selector */}
              <BranchDropdown
                current={currentBranch}
                branches={branches}
                onSwitch={handleSwitchBranch}
                disabled={switching || loading}
              />

              {/* Stats */}
              {diffResult && (
                <div className="flex gap-3 font-mono text-xs font-bold uppercase">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-[#00aa55] inline-block" />
                    +{diffResult.total_additions}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-[#e63b2e] inline-block" />
                    -{diffResult.total_deletions}
                  </span>
                  <span className="opacity-60">{diffResult.files.length} file{diffResult.files.length !== 1 ? "s" : ""}</span>
                </div>
              )}

              {/* Refresh */}
              <button
                className="flex items-center gap-1 border-2 border-[#1a1a1a] dark:border-[#1a1a1a] text-[#1a1a1a] px-2 py-1 font-mono text-xs font-bold bg-transparent hover:bg-[#1a1a1a] hover:text-[#ffcc00] transition-none disabled:opacity-50"
                onClick={() => void fetchDiff()}
                disabled={loading}
                title="Refresh"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                  {loading ? "sync" : "refresh"}
                </span>
              </button>
            </div>
          </div>

          <button
            className="border-4 border-[#1a1a1a] p-2 bg-white text-[#1a1a1a] hover:bg-[#e63b2e] hover:text-white transition-none active:translate-x-[2px] active:translate-y-[2px] shrink-0 ml-4"
            onClick={onClose}
          >
            <span className="material-symbols-outlined font-black">close</span>
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        {error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <span className="material-symbols-outlined text-5xl text-[#e63b2e]">error</span>
            <p className="font-mono text-sm text-[#e63b2e] dark:text-[#ff8888] border-4 border-[#e63b2e] p-4">
              {error}
            </p>
            <button
              className="border-4 border-[#1a1a1a] dark:border-[#f5f0e8] px-6 py-2 font-headline font-black uppercase hover:bg-[#ffcc00] dark:text-[#f5f0e8] dark:hover:text-[#1a1a1a] transition-none"
              onClick={() => void fetchDiff()}
            >
              Retry
            </button>
          </div>
        ) : loading && !diffResult ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <span className="material-symbols-outlined text-5xl animate-spin text-[#1a1a1a] dark:text-[#f5f0e8]">sync</span>
            <p className="font-['Space_Grotesk'] font-black text-lg uppercase text-[#1a1a1a] dark:text-[#f5f0e8]">
              Scanning changes…
            </p>
          </div>
        ) : !diffResult || diffResult.files.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-6 bg-[#ffcc00] dark:bg-[#ffcc00] shadow-[4px_4px_0px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_0px_#f5f0e8]">
              <span className="material-symbols-outlined text-5xl text-[#1a1a1a] dark:text-[#1a1a1a]">check_circle</span>
            </div>
            <p className="font-['Space_Grotesk'] font-black text-2xl uppercase text-[#1a1a1a] dark:text-[#f5f0e8]">
              Working tree clean
            </p>
            <p className="font-mono text-xs opacity-60 dark:text-[#f5f0e8]">
              No staged or unstaged changes on <strong>{currentBranch}</strong>
            </p>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* File list */}
            <div className="w-56 shrink-0 border-r-4 border-[#1a1a1a] dark:border-[#f5f0e8] flex flex-col bg-[#eee9e0] dark:bg-[#0a0a0a]">
              <div className="p-3 border-b-2 border-[#1a1a1a] dark:border-[#f5f0e8] font-['Space_Grotesk'] font-black text-[10px] uppercase tracking-widest opacity-60 bg-[#e2ddd4] dark:bg-[#111] dark:text-[#f5f0e8]">
                CHANGED_FILES
              </div>
              <div className="flex-1 overflow-y-auto">
                {diffResult.files.map((file) => (
                  <FileListItem
                    key={file.path}
                    file={file}
                    active={selectedFile?.path === file.path}
                    onClick={() => setSelectedFilePath(file.path)}
                  />
                ))}
              </div>
            </div>

            {/* Diff view */}
            <div className="flex-1 flex flex-col bg-white dark:bg-[#0e0e0e] overflow-hidden">
              {selectedFile ? (
                <>
                  {/* File header */}
                  <div className="px-4 py-3 border-b-2 border-[#1a1a1a] dark:border-[#f5f0e8] flex justify-between items-center bg-[#f5f0e8] dark:bg-[#111] shrink-0">
                    <div className="font-mono text-[11px] font-bold text-[#0055ff] dark:text-[#88aaff] truncate">
                      {selectedFile.path.toUpperCase()}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <span className="bg-[#e63b2e] text-white px-1 text-[10px] font-bold">
                        -{selectedFile.deletions}
                      </span>
                      <span className="bg-[#00aa55] text-white px-1 text-[10px] font-bold">
                        +{selectedFile.additions}
                      </span>
                    </div>
                  </div>
                  {fileError && !fileDetails[selectedFile.path] ? (
                    <div className="flex-1 flex items-center justify-center p-8 text-center">
                      <p className="font-mono text-xs text-[#e63b2e] dark:text-[#ff8888] border-4 border-[#e63b2e] p-4">
                        {fileError}
                      </p>
                    </div>
                  ) : fileLoading && !fileDetails[selectedFile.path] ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                      <span className="material-symbols-outlined text-4xl animate-spin text-[#1a1a1a] dark:text-[#f5f0e8]">sync</span>
                      <p className="font-mono text-xs uppercase tracking-wide dark:text-[#f5f0e8]">
                        Loading file diff…
                      </p>
                    </div>
                  ) : (
                    <DiffView file={selectedFile} projectPath={project?.path ?? ""} />
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[#1a1a1a]/30 dark:text-[#f5f0e8]/30 font-mono text-sm">
                  Select a file to view diff
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="p-6 border-t-8 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#eee9e0] dark:bg-[#111] flex gap-3 items-center shrink-0">
          <div className="flex-1 border-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#1a1a1a] dark:bg-[#f5f0e8] text-[#f5f0e8] dark:text-[#1a1a1a] p-4 flex items-center gap-3 shadow-[4px_4px_0px_0px_#ffcc00]">
            <span className="material-symbols-outlined text-[#ffcc00] dark:text-[#1a1a1a] shrink-0">smart_toy</span>
            <div>
              <p className="font-['Space_Grotesk'] font-black text-sm uppercase">Ask Agent to Commit</p>
              <p className="font-mono text-[10px] opacity-60 mt-0.5">
                Tell your agent: <em>"commit all changes with a descriptive message"</em>
              </p>
            </div>
          </div>
          <button
            className="border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-3 hover:bg-[#ffcc00] dark:text-[#f5f0e8] dark:hover:text-[#1a1a1a] dark:bg-[#0e0e0e] bg-white transition-none disabled:opacity-50"
            onClick={() => void fetchDiff()}
            disabled={loading}
            title="Refresh diff"
          >
            <span className="material-symbols-outlined font-black" style={{ fontSize: "20px" }}>
              {loading ? "sync" : "refresh"}
            </span>
          </button>
          <button
            className="border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-3 hover:bg-[#e63b2e] hover:text-white dark:text-[#f5f0e8] dark:bg-[#0e0e0e] bg-white transition-none"
            onClick={onClose}
            title="Close"
          >
            <span className="material-symbols-outlined font-black" style={{ fontSize: "20px" }}>close</span>
          </button>
        </div>
      </div>
    </div>
  );
});
