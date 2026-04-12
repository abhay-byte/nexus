import type { Project, RuntimeInfo, SystemHealth } from "../../types";

interface StatusBarProps {
  project: Project | null;
  runningCount: number;
  runtimeInfo: RuntimeInfo;
  health: SystemHealth | null;
}

export function StatusBar({ project, runningCount, runtimeInfo, health }: StatusBarProps) {
  return (
    <footer className="bg-[#1a1a1a] text-[#a0a0a0] flex justify-between px-4 py-1.5 text-[10px] font-mono uppercase z-50 shrink-0 border-t-2 border-[#1a1a1a]">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className={`material-symbols-outlined text-xs ${runningCount > 0 ? "text-[#00ff00]" : "text-[#ffcc00]"}`}>check_circle</span>
          <span className="text-[#f5f0e8]">{runningCount} AGENTS RUNNING</span>
        </div>
        
        <span className="opacity-30">|</span>
        
        <div className="flex items-center gap-1.5 max-w-sm truncate text-[#f5f0e8]">
          <span className="material-symbols-outlined text-xs text-[#a0a0a0]">folder</span>
          <span className="truncate">{project ? `PROJECT: ${project.name} (${project.path})` : "NO ACTIVE PROJECT"}</span>
        </div>
        
        <span className="opacity-30">|</span>
        
        {health && (
          <div className="flex items-center gap-4 text-[#f5f0e8]">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs text-[#a0a0a0]">memory</span>
              <span>CPU: {Math.round(health.cpu)}%</span>
            </div>
            
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs text-[#a0a0a0]">storage</span>
              <span>RAM: {health.ram_used.toFixed(1)}GB</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-[#f5f0e8]">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-xs text-[#a0a0a0]">terminal</span>
          <span>{runtimeInfo.shell.toUpperCase()} ({runtimeInfo.os.toUpperCase()})</span>
        </div>
        
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-xs text-[#a0a0a0]">update</span>
          <span>V0.1.1</span>
        </div>
      </div>
    </footer>
  );
}
