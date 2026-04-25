import { useCallback, useEffect, useRef, useState } from "react";
import { getImageDataUrl } from "../../lib/imageDataUrl";
import type { Project } from "../../types";

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  projectCounts: Record<string, number>;
  collapsed: boolean;
  width: number;
  onSelectProject: (projectId: string) => void;
  onAddProject: () => void;
  onRemoveProject: (projectId: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenSettings: () => void;
  onToggleCollapse: () => void;
  onResizeWidth: (width: number) => void;
}

function getInitials(name: string) {
  return name
    .split(/[\s\-_]+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ProjectIcon({
  project,
  active,
  size,
}: {
  project: Project;
  active: boolean;
  size: number;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!project.icon) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void getImageDataUrl(project.icon).then((dataUrl) => {
      if (!cancelled) setUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [project.icon]);

  if (url) {
    return (
      <img
        src={url}
        alt={project.name}
        className="shrink-0 object-cover"
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          border: active ? "2px solid #1a1a1a" : "2px solid transparent",
        }}
      />
    );
  }

  return (
    <span
      className="shrink-0 flex items-center justify-center font-black text-[10px]"
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        background: project.color ?? "#1a1a1a",
        color: "#fff",
        border: active ? "2px solid #1a1a1a" : "2px solid transparent",
      }}
    >
      {size <= 28 ? getInitials(project.name) : getInitials(project.name).slice(0, 1)}
    </span>
  );
}

export function Sidebar({
  projects,
  activeProjectId,
  projectCounts,
  collapsed,
  width,
  onSelectProject,
  onAddProject,
  onRemoveProject,
  onOpenProject,
  onOpenSettings,
  onToggleCollapse,
  onResizeWidth,
}: SidebarProps) {
  const [menu, setMenu] = useState<{
    projectId: string;
    x: number;
    y: number;
  } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Resize drag handler
  const startResize = useCallback(
    (event: React.PointerEvent) => {
      if (collapsed) return;
      event.preventDefault();
      setIsResizing(true);
      const startX = event.clientX;
      const startWidth = width;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const next = Math.min(Math.max(startWidth + delta, 160), 400);
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
    [collapsed, width, onResizeWidth],
  );

  // Close context menu on resize start
  useEffect(() => {
    if (isResizing) setMenu(null);
  }, [isResizing]);

  const currentWidth = collapsed ? 64 : width;

  return (
    <aside
      ref={sidebarRef}
      className="bg-[#f5f0e8] dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] flex flex-col h-full overflow-y-auto border-r-4 border-[#1a1a1a] dark:border-[#f5f0e8] z-40 shrink-0 font-['Space_Grotesk'] font-bold uppercase relative transition-none"
      style={{ width: currentWidth }}
      onClick={() => setMenu(null)}
    >
      {/* Header */}
      <div
        className={`border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] flex items-center ${collapsed ? "p-3 justify-center" : "p-6 justify-between"}`}
      >
        {!collapsed && (
          <div>
            <h2 className="font-['Space_Grotesk'] font-bold uppercase text-xl font-black">
              WORKSPACE
            </h2>
            <p className="font-['Space_Grotesk'] text-[10px] opacity-60">v0.1.4</p>
          </div>
        )}
        <button
          className="material-symbols-outlined text-lg hover:text-[#0055ff] bg-transparent border-none cursor-pointer shrink-0"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          type="button"
        >
          {collapsed ? "chevron_right" : "chevron_left"}
        </button>
      </div>

      {/* Projects list */}
      <nav className="flex-grow overflow-y-auto overflow-x-hidden">
        {!collapsed && (
          <div className="px-6 py-4 uppercase text-xs font-black tracking-widest opacity-50">
            Projects
          </div>
        )}
        <div className="flex flex-col">
          {projects.length === 0 && !collapsed ? (
            <div className="px-6 py-4 text-[#1a1a1a] dark:text-[#f5f0e8] opacity-60 text-xs normal-case font-body font-normal">
              Add your first repo to start building a multi-project workspace.
            </div>
          ) : (
            projects.map((project) => {
              const active = project.id === activeProjectId;
              return (
                <div
                  key={project.id}
                  className={`flex items-center cursor-pointer transition-none border-y-2 border-transparent ${
                    active
                      ? "bg-[#ffcc00] text-[#1a1a1a] border-[#1a1a1a] font-black"
                      : "text-[#1a1a1a] dark:text-[#f5f0e8] opacity-80 hover:bg-[#0055ff] hover:text-white border-b-[#1a1a1a] dark:border-b-[#f5f0e8]"
                  } ${collapsed ? "justify-center px-2 py-3" : "justify-between px-6 py-4"}`}
                  onClick={() => onSelectProject(project.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({
                      projectId: project.id,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  title={project.name}
                >
                  <div className={`flex items-center gap-3 overflow-hidden ${collapsed ? "justify-center" : ""}`}>
                    <ProjectIcon
                      project={project}
                      active={active}
                      size={collapsed ? 40 : 28}
                    />
                    {!collapsed && <span className="truncate">{project.name}</span>}
                  </div>
                  {!collapsed && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs opacity-60 px-1">
                        {projectCounts[project.id] ?? 0}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Add project button */}
        <div className={collapsed ? "p-3" : "p-6"}>
          <button
            className={`bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] shadow-[4px_4px_0px_0px_#ffcc00] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-black transition-all flex items-center justify-center ${collapsed ? "w-10 h-10 text-lg" : "w-full py-3 text-sm"}`}
            onClick={onAddProject}
            title="Add project"
            type="button"
          >
            {collapsed ? "+" : "+ ADD PROJECT"}
          </button>
        </div>
      </nav>

      {/* Resize handle */}
      {!collapsed && (
        <div
          className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize z-50 hover:bg-[#ffcc00] hover:opacity-50 transition-colors"
          onPointerDown={startResize}
          title="Drag to resize"
        />
      )}

      {/* Context menu */}
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
