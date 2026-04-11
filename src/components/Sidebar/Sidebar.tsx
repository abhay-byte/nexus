import { useState } from "react";
import type { Project } from "../../types";

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  projectCounts: Record<string, number>;
  onSelectProject: (projectId: string) => void;
  onAddProject: () => void;
  onRemoveProject: (projectId: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  projects,
  activeProjectId,
  projectCounts,
  onSelectProject,
  onAddProject,
  onRemoveProject,
  onOpenProject,
  onOpenSettings,
}: SidebarProps) {
  const [menu, setMenu] = useState<{
    projectId: string;
    x: number;
    y: number;
  } | null>(null);

  return (
    <aside className="bg-[#f5f0e8] dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] flex flex-col h-full overflow-y-auto w-64 border-r-4 border-[#1a1a1a] dark:border-[#f5f0e8] z-40 hidden md:flex shrink-0 font-['Space_Grotesk'] font-bold uppercase" onClick={() => setMenu(null)}>
      <div className="p-6 border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8]">
        <h2 className="font-['Space_Grotesk'] font-bold uppercase text-xl font-black">WORKSPACE</h2>
        <p className="font-['Space_Grotesk'] text-[10px] opacity-60">v0.1.1</p>
      </div>

      <nav className="flex-grow overflow-y-auto">
        <div className="px-6 py-4 uppercase text-xs font-black tracking-widest opacity-50">Projects</div>
        <div className="flex flex-col">
          {projects.length === 0 ? (
            <div className="px-6 py-4 text-[#1a1a1a] dark:text-[#f5f0e8] opacity-60 text-xs normal-case font-body font-normal">
              Add your first repo to start building a multi-project workspace.
            </div>
          ) : (
            projects.map((project) => {
              const active = project.id === activeProjectId;
              return (
                <div
                  key={project.id}
                  className={`flex items-center justify-between px-6 py-4 cursor-pointer transition-none border-y-2 border-transparent ${
                    active 
                      ? "bg-[#ffcc00] text-[#1a1a1a] border-[#1a1a1a] font-black" 
                      : "text-[#1a1a1a] dark:text-[#f5f0e8] opacity-80 hover:bg-[#0055ff] hover:text-white border-b-[#1a1a1a] dark:border-b-[#f5f0e8]"
                  }`}
                  onClick={() => onSelectProject(project.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({
                      projectId: project.id,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span 
                      className="w-2 h-2 rounded-full shrink-0 border border-[#1a1a1a] dark:border-[#f5f0e8]" 
                      style={{ background: project.color ?? "#1a1a1a" }} 
                    />
                    <span className="truncate">{project.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs opacity-60 px-1">{projectCounts[project.id] ?? 0}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-6">
          <button 
            className="w-full bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a] py-3 border-4 border-[#1a1a1a] dark:border-[#f5f0e8] shadow-[4px_4px_0px_0px_#ffcc00] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-black text-sm transition-all"
            onClick={onAddProject}
          >
            + ADD PROJECT
          </button>
        </div>
      </nav>

      {menu ? (
        <div
          className="fixed bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] p-2 flex flex-col z-[100] min-w-[180px] shadow-[8px_8px_0px_0px_#1a1a1a]"
          style={{ top: menu.y, left: menu.x }}
        >
          <button
            className="w-full text-left font-['Space_Grotesk'] font-bold uppercase px-4 py-2 hover:bg-[#ffcc00] hover:text-[#1a1a1a] border-2 border-transparent hover:border-[#1a1a1a]"
            onClick={() => {
              onOpenProject(menu.projectId);
              setMenu(null);
            }}
          >
            Open folder
          </button>
          <button
            className="w-full text-left font-['Space_Grotesk'] font-bold uppercase px-4 py-2 hover:bg-[#ffcc00] hover:text-[#1a1a1a] border-2 border-transparent hover:border-[#1a1a1a]"
            onClick={() => {
              onOpenSettings();
              setMenu(null);
            }}
          >
            Settings
          </button>
          <button
            className="w-full text-left font-['Space_Grotesk'] font-bold uppercase px-4 py-2 text-[#e63b2e] hover:bg-[#e63b2e] hover:text-white border-2 border-transparent hover:border-[#1a1a1a]"
            onClick={() => {
              void onRemoveProject(menu.projectId);
              setMenu(null);
            }}
          >
            Remove project
          </button>
        </div>
      ) : null}
    </aside>
  );
}
