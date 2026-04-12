import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSessionStore } from "../../store/sessionStore";
import type { Project } from "../../types";

interface TitlebarProps {
  projects: Project[];
  activeProjectId: string | null;
  openProjectIds: string[];
  projectAttention: Record<string, number>;
  onSelectProject: (projectId: string) => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenGitDiff: () => void;
}

export function Titlebar({ projects, activeProjectId, openProjectIds, projectAttention, onSelectProject, onOpenSettings, onOpenSearch, onOpenGitDiff }: TitlebarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();
  const runtimeInfo = useSessionStore((state) => state.runtimeInfo);
  const isMac = runtimeInfo?.os === "macos";

  useEffect(() => {
    let mounted = true;

    const syncMaximized = async () => {
      const maximized = await appWindow.isMaximized();
      if (mounted) {
        setIsMaximized(maximized);
      }
    };

    void syncMaximized();

    const unlistenPromise = appWindow.onResized(() => {
      void syncMaximized();
    });

    return () => {
      mounted = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [appWindow]);

  const openProjects = openProjectIds
    .map((projectId) => projects.find((project) => project.id === projectId))
    .filter((project): project is Project => Boolean(project));

  return (
    <header className="bg-[#f5f0e8] dark:bg-[#1a1a1a] border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] flex justify-between items-center w-full px-6 h-16 z-50 shadow-[4px_4px_0px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_0px_#f5f0e8] fixed top-0 left-0" data-tauri-drag-region>
      <div className="flex items-center gap-6 h-full" data-tauri-drag-region>
        <div className="text-2xl font-['Space_Grotesk'] uppercase tracking-tighter font-black text-[#1a1a1a] dark:text-[#f5f0e8] border-2 border-[#1a1a1a] dark:border-[#f5f0e8] px-2 h-8 flex items-center shrink-0">
          NEXUS_TERMINAL
        </div>
        <nav className="hidden md:flex h-full items-center gap-1 font-['Space_Grotesk'] uppercase tracking-tighter font-black">
          {openProjects.map((project) => {
            const active = project.id === activeProjectId;
            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`flex items-center gap-2 h-full px-4 ${
                  active
                    ? "text-[#ffcc00] underline decoration-4 cursor-pointer"
                    : "text-[#1a1a1a] dark:text-[#f5f0e8] opacity-60 hover:bg-[#ffcc00] hover:text-[#1a1a1a] hover:opacity-100 transition-none cursor-pointer"
                }`}
              >
                {project.name}
                {projectAttention[project.id] ? (
                  <span className="bg-red-500 text-white rounded-full px-2 py-0.5 text-[10px] no-underline">
                    {projectAttention[project.id]}
                  </span>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {isMac && (
          <div className="flex gap-2 mr-4 group">
            <span className="w-3 h-3 rounded-full bg-[#e63b2e] border border-[#1a1a1a] cursor-pointer hover:brightness-110" onClick={() => void appWindow.close()}></span>
            <span className="w-3 h-3 rounded-full bg-[#ffcc00] border border-[#1a1a1a] cursor-pointer hover:brightness-110" onClick={() => void appWindow.minimize()}></span>
            <span className="w-3 h-3 rounded-full bg-[#00ff00] border border-[#1a1a1a] cursor-pointer hover:brightness-110" onClick={() => void appWindow.toggleMaximize()}></span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined cursor-pointer rounded-none hover:bg-[#ffcc00] p-1 border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] dark:hover:text-[#1a1a1a]" onClick={onOpenSearch}>search</span>
          <span className="material-symbols-outlined cursor-pointer rounded-none hover:bg-[#ffcc00] p-1 border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] dark:hover:text-[#1a1a1a]" title="Git Diff" onClick={onOpenGitDiff}>account_tree</span>
          <span className="material-symbols-outlined cursor-pointer rounded-none hover:bg-[#ffcc00] p-1 border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] dark:hover:text-[#1a1a1a]" onClick={onOpenSettings}>settings</span>
          
          {!isMac && (
            <>
              <span className="material-symbols-outlined cursor-pointer rounded-none hover:bg-[#ffcc00] p-1 border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] dark:hover:text-[#1a1a1a]" onClick={() => void appWindow.minimize()}>minimize</span>
              <span className="material-symbols-outlined cursor-pointer rounded-none hover:bg-[#ffcc00] p-1 border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] dark:hover:text-[#1a1a1a]" onClick={() => void appWindow.toggleMaximize()}>{isMaximized ? "restore_page" : "maximize"}</span>
              <span className="material-symbols-outlined cursor-pointer rounded-none hover:bg-[#e63b2e] hover:text-white p-1 border-2 border-transparent hover:border-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] dark:hover:text-white" onClick={() => void appWindow.close()}>close</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
