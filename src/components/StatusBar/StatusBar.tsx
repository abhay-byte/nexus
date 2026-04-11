import type { Project, RuntimeInfo } from "../../types";

interface StatusBarProps {
  project: Project | null;
  runningCount: number;
  runtimeInfo: RuntimeInfo;
}

export function StatusBar({ project, runningCount, runtimeInfo }: StatusBarProps) {
  return (
    <footer className="bg-[#1a1a1a] text-white flex justify-between px-4 py-1 text-[10px] font-['Space_Grotesk'] uppercase border-t-4 border-[#1a1a1a] z-50 shrink-0">
      <div className="flex gap-4">
        <span><span className={runningCount > 0 ? "text-[#00ff00]" : "text-[#ffcc00]"}>●</span> {runningCount} AGENTS RUNNING</span>
        <span className="opacity-50 truncate max-w-md">{project ? project.path : "NO ACTIVE PROJECT"}</span>
      </div>
      <div className="opacity-50">
        {runtimeInfo.shell} • {runtimeInfo.os}
      </div>
    </footer>
  );
}
