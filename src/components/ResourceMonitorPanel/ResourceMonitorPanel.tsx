import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ProcessInfo, SystemHealth } from "../../types";

interface ResourceMonitorPanelProps {
  open: boolean;
  onClose: () => void;
  health: SystemHealth | null;
  width: number;
  onResizeWidth: (width: number) => void;
}

type SortKey = "cpu" | "ram";
type SortDir = "asc" | "desc";

export function ResourceMonitorPanel({
  open,
  onClose,
  health,
  width,
  onResizeWidth,
}: ResourceMonitorPanelProps) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [killing, setKilling] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("cpu");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (!open) return;

    let active = true;
    const fetchProcesses = async () => {
      try {
        const result = await invoke<ProcessInfo[]>("list_processes");
        if (active) setProcesses(result);
      } catch {
        /* ignore */
      }
    };

    void fetchProcesses();
    const timer = setInterval(() => void fetchProcesses(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [open]);

  const handleKill = async (pid: number) => {
    setKilling(pid);
    try {
      await invoke("kill_process", { pid });
      setProcesses((prev) => prev.filter((p) => p.pid !== pid));
    } catch {
      /* ignore */
    } finally {
      setKilling(null);
    }
  };

  const toggleSort = (key: SortKey) => {
    setSortKey((current) => {
      if (current === key) {
        setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
        return current;
      }
      setSortDir("desc");
      return key;
    });
  };

  const sortedProcesses = useMemo(() => {
    const sorted = [...processes];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "cpu") {
        cmp = a.cpu_usage - b.cpu_usage;
      } else {
        cmp = a.memory_mb - b.memory_mb;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [processes, sortKey, sortDir]);

  const startResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      setIsResizing(true);
      const startX = event.clientX;
      const startWidth = width;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        const next = Math.min(Math.max(startWidth + delta, 280), 600);
        onResizeWidth(next);
      };

      const onUp = () => {
        setIsResizing(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [width, onResizeWidth],
  );

  if (!open) return null;

  const totalCpu = health?.cpu ?? 0;
  const totalRamUsed = health?.ram_used ?? 0;
  const totalRam = health?.ram_total ?? 0;
  const ramPercent = totalRam > 0 ? (totalRamUsed / totalRam) * 100 : 0;

  const SortArrow = ({ active, dir }: { active: boolean; dir: SortDir }) => {
    if (!active) return <span className="inline-block w-2 opacity-0">↕</span>;
    return (
      <span className="inline-block w-2 text-[#ffcc00]">
        {dir === "desc" ? "↓" : "↑"}
      </span>
    );
  };

  return (
    <div
      className="relative flex flex-col h-full bg-[#f5f0e8] dark:bg-[#1a1a1a] border-l-4 border-[#1a1a1a] dark:border-[#f5f0e8] shrink-0"
      style={{ width }}
    >
      {/* Resize handle on left edge */}
      <div
        className={`absolute top-0 left-0 bottom-0 w-2 cursor-col-resize z-50 hover:bg-[#ffcc00] hover:opacity-50 transition-colors ${isResizing ? "bg-[#ffcc00] opacity-50" : ""}`}
        onPointerDown={startResize}
        title="Drag to resize"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#ffcc00]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#1a1a1a] text-lg">bar_chart</span>
          <h2 className="font-['Space_Grotesk'] font-black uppercase text-xs tracking-wide text-[#1a1a1a]">
            Resource Monitor
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#ffcc00] border-2 border-[#1a1a1a] font-black text-sm transition-none bg-transparent cursor-pointer"
          title="Close"
        >
          ×
        </button>
      </div>

      {/* System totals */}
      <div className="grid grid-cols-2 gap-0 border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8]">
        <div className="px-3 py-2 bg-[#e8e3da] dark:bg-[#252525] border-r-2 border-[#1a1a1a] dark:border-[#f5f0e8]">
          <span className="font-mono text-[9px] font-bold uppercase text-[#888]">Total CPU</span>
          <p className="font-mono text-sm font-black text-[#1a1a1a] dark:text-[#f5f0e8]">
            {totalCpu.toFixed(1)}%
          </p>
        </div>
        <div className="px-3 py-2 bg-[#e8e3da] dark:bg-[#252525]">
          <span className="font-mono text-[9px] font-bold uppercase text-[#888]">Total RAM</span>
          <p className="font-mono text-sm font-black text-[#1a1a1a] dark:text-[#f5f0e8]">
            {totalRamUsed.toFixed(1)} / {totalRam.toFixed(1)} GB
          </p>
          <div className="mt-1 h-1 w-full bg-[#1a1a1a]/20 dark:bg-[#f5f0e8]/20">
            <div
              className="h-full bg-[#e63b2e]"
              style={{ width: `${Math.min(ramPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[60px_1fr_50px_60px_50px] gap-1 px-3 py-2 border-b-2 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#e8e3da] dark:bg-[#252525] shrink-0">
        <span className="font-mono text-[9px] font-bold uppercase text-[#1a1a1a] dark:text-[#888]">PID</span>
        <span className="font-mono text-[9px] font-bold uppercase text-[#1a1a1a] dark:text-[#888]">Name</span>
        <button
          type="button"
          onClick={() => toggleSort("cpu")}
          className="font-mono text-[9px] font-bold uppercase text-[#1a1a1a] dark:text-[#888] text-right hover:text-[#ffcc00] cursor-pointer flex items-center justify-end gap-1"
        >
          CPU <SortArrow active={sortKey === "cpu"} dir={sortDir} />
        </button>
        <button
          type="button"
          onClick={() => toggleSort("ram")}
          className="font-mono text-[9px] font-bold uppercase text-[#1a1a1a] dark:text-[#888] text-right hover:text-[#ffcc00] cursor-pointer flex items-center justify-end gap-1"
        >
          RAM <SortArrow active={sortKey === "ram"} dir={sortDir} />
        </button>
        <span></span>
      </div>

      {/* Process list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {sortedProcesses.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <span className="font-mono text-[10px] text-[#888] uppercase">Loading processes…</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {sortedProcesses.map((proc, i) => (
              <div
                key={proc.pid}
                className={`grid grid-cols-[60px_1fr_50px_60px_50px] gap-1 px-3 py-2 items-center border-b-2 border-[#1a1a1a] dark:border-[#333] ${
                  i % 2 === 0 ? "bg-transparent" : "bg-[#e8e3da]/50 dark:bg-[#252525]/50"
                }`}
              >
                <span className="font-mono text-[10px] text-[#1a1a1a] dark:text-[#f5f0e8] truncate">
                  {proc.pid}
                </span>
                <span className="font-mono text-[10px] text-[#1a1a1a] dark:text-[#f5f0e8] truncate" title={proc.name}>
                  {proc.name}
                </span>
                <span className="font-mono text-[10px] text-[#1a1a1a] dark:text-[#f5f0e8] text-right">
                  {proc.cpu_usage.toFixed(1)}%
                </span>
                <span className="font-mono text-[10px] text-[#1a1a1a] dark:text-[#f5f0e8] text-right">
                  {proc.memory_mb > 1024
                    ? `${(proc.memory_mb / 1024).toFixed(1)}G`
                    : `${proc.memory_mb.toFixed(0)}M`}
                </span>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleKill(proc.pid)}
                    disabled={killing === proc.pid}
                    className="px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white bg-[#e63b2e] border-2 border-[#1a1a1a] dark:border-[#f5f0e8] hover:bg-[#1a1a1a] hover:text-[#e63b2e] transition-none cursor-pointer disabled:opacity-50"
                    title={`Kill ${proc.name}`}
                  >
                    {killing === proc.pid ? "…" : "Kill"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#e8e3da] dark:bg-[#252525] shrink-0">
        <span className="font-mono text-[9px] uppercase text-[#888]">
          {sortedProcesses.length} process{sortedProcesses.length !== 1 ? "es" : ""} shown
        </span>
      </div>
    </div>
  );
}
