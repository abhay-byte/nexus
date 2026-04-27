import type { Project, RuntimeInfo, SystemHealth } from "../../types";

interface StatusBarProps {
  project: Project | null;
  runningCount: number;
  runtimeInfo: RuntimeInfo;
  health: SystemHealth | null;
}

function getBrowserOsLabel() {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("win")) {
    return "Windows";
  }
  if (platform.includes("mac")) {
    return "macOS";
  }
  if (platform.includes("linux") || platform.includes("x11")) {
    return "Linux";
  }
  return navigator.platform || "Desktop";
}

function formatOsLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "desktop") {
    return getBrowserOsLabel();
  }
  if (normalized === "macos") {
    return "macOS";
  }
  if (normalized === "windows") {
    return "Windows";
  }
  if (normalized === "linux") {
    return "Linux";
  }
  return value;
}

function formatShellLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "shell") {
    return "Auto";
  }
  if (normalized === "auto") {
    return "Auto";
  }
  if (normalized === "pwsh" || normalized === "pwsh.exe" || normalized === "powershell" || normalized === "powershell.exe") {
    return "PowerShell";
  }
  if (normalized === "cmd" || normalized === "cmd.exe") {
    return "CMD";
  }
  if (normalized === "zsh") {
    return "zsh";
  }
  if (normalized === "bash") {
    return "bash";
  }
  if (normalized === "fish") {
    return "fish";
  }
  return value.split(/[\\/]/).pop() || value;
}

export function StatusBar({ project, runningCount, runtimeInfo, health }: StatusBarProps) {
  const shellLabel = formatShellLabel(runtimeInfo.shell);
  const osLabel = formatOsLabel(runtimeInfo.os);

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
          <span>{shellLabel.toUpperCase()} ({osLabel.toUpperCase()})</span>
        </div>
        
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-xs text-[#a0a0a0]">update</span>
          <span>V0.1.7</span>
        </div>
      </div>
    </footer>
  );
}
