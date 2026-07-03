import { createContext, useState, useCallback, useEffect } from "react";
import { OnboardingPageWelcome } from "./OnboardingPageWelcome";
import { OnboardingPageFeatures } from "./OnboardingPageFeatures";
import { OnboardingPageTheme } from "./OnboardingPageTheme";
import { OnboardingPageKanban } from "./OnboardingPageKanban";
import { OnboardingPageProject } from "./OnboardingPageProject";
import { isTauri } from "../../lib/api";
import type { PlankaConfig, AddProjectDraft, Project, AppSettings } from "../../types";
import { PROJECT_SWATCHES } from "../../constants/agents";

export interface KanbanOnboardingChoice {
  type: "local" | "planka";
  plankaConfig?: PlankaConfig;
}

export interface OnboardingContextValue {
  currentPage: number;
  theme: AppSettings["theme"];
  setTheme: (theme: AppSettings["theme"]) => void;
  kanbanChoice: KanbanOnboardingChoice | null;
  setKanbanChoice: (choice: KanbanOnboardingChoice | null) => void;
  projectDraft: AddProjectDraft;
  setProjectDraft: (draft: AddProjectDraft) => void;
}

export const OnboardingContext = createContext<OnboardingContextValue>({
  currentPage: 0,
  theme: "dark",
  setTheme: () => {},
  kanbanChoice: null,
  setKanbanChoice: () => {},
  projectDraft: { name: "", path: "", color: PROJECT_SWATCHES[0], category: "other", defaultAgents: [], mcpServers: [], cavemanAgentIds: [], mcpPresetIds: [] },
  setProjectDraft: () => {},
});

interface OnboardingProps {
  onFinish: (result: { project: Project; kanbanChoice: KanbanOnboardingChoice | null }) => void;
  installedAgents: string[];
}

const PAGES = [
  { index: 0, Component: OnboardingPageWelcome },
  { index: 1, Component: OnboardingPageFeatures },
  { index: 2, Component: OnboardingPageTheme },
  { index: 3, Component: OnboardingPageKanban },
  { index: 4, Component: OnboardingPageProject },
] as const;

const TOTAL = PAGES.length;

function OnboardingTitlebar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [appWindow, setAppWindow] = useState<ReturnType<typeof import("@tauri-apps/api/window").getCurrentWindow> | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let mounted = true;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      if (!mounted) return;
      setAppWindow(win);
      const sync = async () => {
        const maximized = await win.isMaximized();
        if (mounted) setIsMaximized(maximized);
      };
      void sync();
      const unlisten = await win.onResized(() => void sync());
      return () => { mounted = false; void unlisten(); };
    })();
  }, []);

  const handleMinimize = () => appWindow?.minimize();
  const handleToggleMaximize = () => appWindow?.toggleMaximize();
  const handleClose = () => appWindow?.close();

  return (
    <header
      className="w-full h-12 shrink-0 bg-[#0d0d0d] border-b-2 border-[#2a2a2a] flex items-center justify-between px-4 z-20"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <img src="/logo.png" alt="Nexus" className="w-6 h-6 object-contain" />
        <span className="font-['Space_Grotesk'] font-black text-xs uppercase text-[#555] tracking-widest">
          Nexus Terminal
        </span>
      </div>
      {isTauri() && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleMinimize}
            className="w-8 h-8 flex items-center justify-center text-[#555] hover:text-[#ffcc00] hover:bg-[#1a1a1a] transition-colors"
            aria-label="Minimize"
          >
            <span className="material-symbols-outlined text-lg">minimize</span>
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            className="w-8 h-8 flex items-center justify-center text-[#555] hover:text-[#ffcc00] hover:bg-[#1a1a1a] transition-colors"
            aria-label={isMaximized ? "Restore" : "Maximize"}
          >
            <span className="material-symbols-outlined text-lg">
              {isMaximized ? "restore_page" : "maximize"}
            </span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center text-[#555] hover:text-white hover:bg-[#e63b2e] transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      )}
    </header>
  );
}

export function Onboarding({ onFinish, installedAgents }: OnboardingProps) {
  const [page, setPage] = useState(0);
  const [theme, setThemeState] = useState<AppSettings["theme"]>("dark");
  const setTheme = useCallback((t: AppSettings["theme"]) => {
    setThemeState(t);
    if (t === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("nexus-theme", t);
  }, []);
  const [kanbanChoice, setKanbanChoice] = useState<KanbanOnboardingChoice | null>(null);
  const [projectDraft, setProjectDraft] = useState<AddProjectDraft>({
    name: "",
    path: "",
    color: PROJECT_SWATCHES[0],
    category: "other",
    defaultAgents: installedAgents,
    mcpServers: [],
    agencyAgent: { enabled: false, selectedAgentSlug: "agents-orchestrator" },
    specKit: { enabled: false, agentId: null },
    cavemanAgentIds: [],
    mcpPresetIds: [],
  });

  const isFirst = page === 0;
  const isLast = page === TOTAL - 1;

  const goNext = useCallback(() => {
    if (!isLast) setPage((p) => p + 1);
  }, [isLast]);

  const goPrev = useCallback(() => {
    if (!isFirst) setPage((p) => p - 1);
  }, [isFirst]);

  const contextValue: OnboardingContextValue = {
    currentPage: page,
    theme,
    setTheme,
    kanbanChoice,
    setKanbanChoice,
    projectDraft,
    setProjectDraft,
  };

  return (
    <OnboardingContext.Provider value={contextValue}>
      <div
        className={`fixed inset-0 z-[100] flex flex-col bg-[#0d0d0d] font-['Space_Grotesk'] select-none ${theme === "dark" ? "dark" : ""}`}
      >
        <OnboardingTitlebar />

        {/* Content area */}
        <div className="flex-1 relative overflow-hidden">
          {PAGES.map(({ index, Component }) => {
            const visible = page === index;
            const PageComponent = Component as React.ComponentType<{
              visible: boolean;
              installedAgents?: string[];
              onFinish?: (project: Project) => void;
            }>;
            return (
              <PageComponent
                key={index}
                visible={visible}
                installedAgents={installedAgents}
                onFinish={(project: Project) => onFinish({ project, kanbanChoice })}
              />
            );
          })}

          {/* Page dots */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-10">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  i === page ? "bg-[#ffcc00] scale-125 shadow-[0_0_8px_#ffcc00]" : "bg-[#2a2a2a]"
                }`}
              />
            ))}
          </div>

          {/* Left arrow */}
          <button
            type="button"
            onClick={goPrev}
            className={`absolute left-6 top-1/2 -translate-y-1/2 z-10 w-14 h-14 border-4 border-[#ffcc00] bg-[#1a1a1a] text-[#ffcc00] flex items-center justify-center hover:bg-[#ffcc00] hover:text-[#1a1a1a] transition-all duration-200 ${
              isFirst ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
            aria-label="Previous page"
          >
            <span className="material-symbols-outlined text-3xl">arrow_back</span>
          </button>

          {/* Right arrow */}
          {!isLast && (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-6 top-1/2 -translate-y-1/2 z-10 w-14 h-14 border-4 border-[#ffcc00] bg-[#1a1a1a] text-[#ffcc00] flex items-center justify-center hover:bg-[#ffcc00] hover:text-[#1a1a1a] transition-all duration-200"
              aria-label="Next page"
            >
              <span className="material-symbols-outlined text-3xl">arrow_forward</span>
            </button>
          )}
        </div>
      </div>
    </OnboardingContext.Provider>
  );
}
