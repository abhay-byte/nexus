import { createContext, useState, useCallback, useEffect } from "react";
import { OnboardingPageWelcome } from "./OnboardingPageWelcome";
import { OnboardingPageFeatures } from "./OnboardingPageFeatures";
import { OnboardingPageTheme } from "./OnboardingPageTheme";
import { OnboardingPageKanban } from "./OnboardingPageKanban";
import { OnboardingPageProject } from "./OnboardingPageProject";
import { isTauri } from "../../lib/api";
import type { PlankaConfig, AddProjectDraft, Project, AppSettings } from "../../types";
import { PROJECT_SWATCHES } from "../../constants/agents";
import { useSessionStore } from "../../store/sessionStore";

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
  onFinish: (result: { project: Project | null; kanbanChoice: KanbanOnboardingChoice | null }) => void;
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
      className="w-full h-12 shrink-0 bg-[#f5f0e8] dark:bg-[#0d0d0d] border-b-4 border-[#1a1a1a] dark:border-[#2a2a2a] flex items-center justify-between px-4 z-20 transition-colors duration-300"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <img src="/logo.png" alt="Nexus" className="w-6 h-6 object-contain" />
        <span className="font-['Space_Grotesk'] font-black text-xs uppercase text-[#1a1a1a] dark:text-[#888] tracking-widest">
          Nexus Terminal
        </span>
      </div>
      {isTauri() && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleMinimize}
            className="w-8 h-8 flex items-center justify-center text-[#1a1a1a] dark:text-[#555] hover:text-[#ffcc00] hover:bg-[#1a1a1a] dark:hover:bg-[#1a1a1a] transition-colors"
            aria-label="Minimize"
          >
            <span className="material-symbols-outlined text-lg">minimize</span>
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            className="w-8 h-8 flex items-center justify-center text-[#1a1a1a] dark:text-[#555] hover:text-[#ffcc00] hover:bg-[#1a1a1a] dark:hover:bg-[#1a1a1a] transition-colors"
            aria-label={isMaximized ? "Restore" : "Maximize"}
          >
            <span className="material-symbols-outlined text-lg">
              {isMaximized ? "restore_page" : "maximize"}
            </span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center text-[#1a1a1a] dark:text-[#555] hover:text-white hover:bg-[#e63b2e] dark:hover:bg-[#e63b2e] transition-colors"
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
  const settings = useSessionStore((state) => state.settings);
  const upsertSettings = useSessionStore((state) => state.upsertSettings);
  const theme = settings.theme;

  const setTheme = useCallback((t: AppSettings["theme"]) => {
    upsertSettings({ theme: t });
  }, [upsertSettings]);
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
        className={`fixed inset-0 z-[100] flex flex-col bg-[#f5f0e8] dark:bg-[#0d0d0d] text-[#1a1a1a] dark:text-[#f5f0e8] font-['Space_Grotesk'] select-none transition-colors duration-300 ${theme === "dark" ? "dark" : ""}`}
      >
        <OnboardingTitlebar />

        {/* Content area — pages only, no nav buttons inside overflow-hidden */}
        <div className="flex-1 relative overflow-hidden">
          {/* Background dot grid pattern */}
          <div className="absolute inset-0 opacity-[0.25] dark:opacity-[0.12] bg-[radial-gradient(#1a1a1a_2px,transparent_2px)] dark:bg-[radial-gradient(#ffffff_1.5px,transparent_1.5px)] [background-size:32px_32px] pointer-events-none z-0" />

          {/* Sweeping drafting line */}
          <div className="absolute left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#ffcc00]/30 dark:via-[#ffcc00]/20 to-transparent pointer-events-none z-0 animate-sweep" />

          {/* Blueprint circular overlays */}
          <div className="absolute -left-16 -bottom-16 w-80 h-80 rounded-full border-3 border-dashed border-[#1a1a1a]/[0.03] dark:border-[#f5f0e8]/[0.04] pointer-events-none z-0 animate-spin-slow" />
          <div className="absolute -right-20 -top-20 w-96 h-96 rounded-full border border-dashed border-[#1a1a1a]/[0.03] dark:border-[#f5f0e8]/[0.04] pointer-events-none z-0 animate-[spin_60s_linear_infinite]" />

          {/* Corner Crosshairs */}
          <div className="absolute left-6 top-6 font-mono text-[#1a1a1a]/15 dark:text-[#f5f0e8]/10 pointer-events-none select-none z-0">+</div >
          <div className="absolute right-6 top-6 font-mono text-[#1a1a1a]/15 dark:text-[#f5f0e8]/10 pointer-events-none select-none z-0">+</div >
          <div className="absolute left-6 bottom-6 font-mono text-[#1a1a1a]/15 dark:text-[#f5f0e8]/10 pointer-events-none select-none z-0">+</div >
          <div className="absolute right-6 bottom-6 font-mono text-[#1a1a1a]/15 dark:text-[#f5f0e8]/10 pointer-events-none select-none z-0">+</div >

          {/* Floating Bauhaus Geometric Shapes */}
          <div className="absolute top-[10%] left-[6%] w-24 h-24 bg-[#e63b2e] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] opacity-[0.06] dark:opacity-[0.1] animate-[spin_35s_linear_infinite] pointer-events-none z-0" />
          <div className="absolute bottom-[18%] left-[8%] w-32 h-32 rounded-full bg-[#ffcc00] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] opacity-[0.06] dark:opacity-[0.1] animate-float pointer-events-none z-0" />
          <div className="absolute top-[22%] right-[6%] w-28 h-28 opacity-[0.06] dark:opacity-[0.1] pointer-events-none z-0" style={{ animationDelay: "-2.5s" }}>
            <svg viewBox="0 0 100 100" className="w-full h-full text-[#0055ff] stroke-[#1a1a1a] dark:stroke-[#f5f0e8] stroke-[6px] fill-current animate-float">
              <polygon points="50,10 90,90 10,90" />
            </svg>
          </div>
          <div className="absolute bottom-[10%] right-[10%] w-16 h-16 bg-[#ffcc00] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] rotate-[20deg] opacity-[0.04] dark:opacity-[0.08] pointer-events-none z-0 animate-float" style={{ animationDelay: "-1s" }} />

          {PAGES.map(({ index, Component }) => {
            const visible = page === index;
            const PageComponent = Component as React.ComponentType<{
              visible: boolean;
              installedAgents?: string[];
              onFinish?: (project: Project | null) => void;
            }>;
            return (
              <PageComponent
                key={index}
                visible={visible}
                installedAgents={installedAgents}
                onFinish={(project: Project | null) => onFinish({ project, kanbanChoice })}
              />
            );
          })}
        </div>

        {/* ── Nav overlay — rendered OUTSIDE overflow-hidden so pages can never intercept clicks ── */}
        <div className="absolute inset-0 pointer-events-none z-[200]" style={{ top: "40px" }}>
          {/* Page dots */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 pointer-events-auto">
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
            className={`pointer-events-auto absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 border-4 border-[#1a1a1a] dark:border-[#ffcc00] bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#ffcc00] flex items-center justify-center hover:bg-[#1a1a1a] hover:text-white dark:hover:bg-[#ffcc00] dark:hover:text-[#1a1a1a] shadow-[4px_4px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_#ffcc00] active:opacity-75 transition-all duration-200 cursor-pointer ${
              isFirst ? "opacity-0 !pointer-events-none" : "opacity-100"
            }`}
            aria-label="Previous page"
          >
            <span className="material-symbols-outlined text-3xl font-black">arrow_back</span>
          </button>

          {/* Right arrow */}
          {!isLast && (
            <button
              type="button"
              onClick={goNext}
              className="pointer-events-auto absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 border-4 border-[#1a1a1a] dark:border-[#ffcc00] bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#ffcc00] flex items-center justify-center hover:bg-[#1a1a1a] hover:text-white dark:hover:bg-[#ffcc00] dark:hover:text-[#1a1a1a] shadow-[4px_4px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_#ffcc00] active:opacity-75 transition-all duration-200 cursor-pointer"
              aria-label="Next page"
            >
              <span className="material-symbols-outlined text-3xl font-black">arrow_forward</span>
            </button>
          )}
        </div>
      </div>
    </OnboardingContext.Provider>
  );
}
