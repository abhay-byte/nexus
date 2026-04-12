import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openPath } from "@tauri-apps/plugin-shell";
import { AgentBar } from "./components/AgentBar/AgentBar";
import { PaneGrid } from "./components/PaneGrid/PaneGrid";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { Titlebar } from "./components/Titlebar/Titlebar";
import { ProjectTabs } from "./components/ProjectTabs/ProjectTabs";
import { AddProjectDialog } from "./components/dialogs/AddProjectDialog";
import { AddCustomAgentDialog } from "./components/dialogs/AddCustomAgentDialog";
import { LogSearchDialog } from "./components/dialogs/LogSearchDialog";
import { TerminalTabBar, KANBAN_TAB_ID } from "./components/TerminalTabBar/TerminalTabBar";
import { KanbanBoard } from "./components/Kanban/KanbanBoard";
import { GitDiffPanel } from "./components/GitDiffPanel/GitDiffPanel";
import { KNOWN_AGENTS } from "./constants/agents";
import { useProjectStore } from "./store/projectStore";
import { useSessionStore } from "./store/sessionStore";
import type { Project, SystemHealth } from "./types";

function BrutalistDropdown({ value, options, onChange }: { value: string, options: {label: string, value: string}[], onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative group w-full">
      <div 
        className="w-full border-4 border-primary dark:border-[#f5f0e8] p-4 font-mono text-lg bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] flex justify-between items-center cursor-pointer hover:bg-[#ffcc00] dark:hover:bg-[#ffcc00] dark:hover:text-[#1a1a1a] transition-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{options.find(o => o.value === value)?.label || value}</span>
        <span className="material-symbols-outlined pointer-events-none">expand_more</span>
      </div>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setIsOpen(false)}></div>
          <div className="absolute top-full left-0 right-0 mt-2 border-4 border-primary dark:border-[#f5f0e8] bg-white dark:bg-[#1a1a1a] shadow-[4px_4px_0px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_0px_#f5f0e8] z-[90] flex flex-col text-[#1a1a1a] dark:text-[#f5f0e8]">
            {options.map(option => (
              <div 
                key={option.value}
                className="p-4 font-mono text-lg cursor-pointer hover:bg-[#ffcc00] dark:hover:bg-[#ffcc00] dark:hover:text-[#1a1a1a] border-b-4 border-primary dark:border-[#f5f0e8] last:border-b-0 transition-none uppercase"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function App() {
  const projects = useProjectStore((state) => state.projects);
  const openProjectIds = useProjectStore((state) => state.openProjectIds);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const bootstrapped = useProjectStore((state) => state.bootstrapped);
  const loading = useProjectStore((state) => state.loading);
  const isAddProjectOpen = useProjectStore((state) => state.isAddProjectOpen);
  const projectError = useProjectStore((state) => state.error);
  const initializeProjects = useProjectStore((state) => state.initialize);
  const openAddProject = useProjectStore((state) => state.openAddProject);
  const closeAddProject = useProjectStore((state) => state.closeAddProject);
  const addProject = useProjectStore((state) => state.addProject);
  const removeProject = useProjectStore((state) => state.removeProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const closeProjectTab = useProjectStore((state) => state.closeProjectTab);
  const hydrateWorkspace = useProjectStore((state) => state.hydrateWorkspace);

  const sessionInitialized = useSessionStore((state) => state.initialized);
  const sessionError = useSessionStore((state) => state.error);
  const layouts = useSessionStore((state) => state.layouts);
  const sessions = useSessionStore((state) => state.sessions);
  const installedAgents = useSessionStore((state) => state.installedAgents);
  const runtimeInfo = useSessionStore((state) => state.runtimeInfo);
  const settings = useSessionStore((state) => state.settings);
  const activePaneIds = useSessionStore((state) => state.activePaneIds);
  const projectAttention = useSessionStore((state) => state.projectAttention);
  const terminalTabs = useSessionStore((state) => state.terminalTabs);
  const activeTabIds = useSessionStore((state) => state.activeTabIds);
  const initializeSessions = useSessionStore((state) => state.initialize);
  const persistSnapshot = useSessionStore((state) => state.persistSnapshot);
  const syncProjects = useSessionStore((state) => state.syncProjects);
  const ensureLayout = useSessionStore((state) => state.ensureLayout);
  const clearProjectAttention = useSessionStore((state) => state.clearProjectAttention);
  const maybeAutoSpawnDefaults = useSessionStore((state) => state.maybeAutoSpawnDefaults);
  const launchAgentForProject = useSessionStore((state) => state.launchAgent);
  const focusPane = useSessionStore((state) => state.focusPane);
  const splitPane = useSessionStore((state) => state.splitPane);
  const killSessionsForProject = useSessionStore((state) => state.killSessionsForProject);
  const upsertSettings = useSessionStore((state) => state.upsertSettings);
  const searchLogs = useSessionStore((state) => state.searchLogs);
  const addTerminalTab = useSessionStore((state) => state.addTerminalTab);
  const closeTerminalTab = useSessionStore((state) => state.closeTerminalTab);
  const setActiveTerminalTab = useSessionStore((state) => state.setActiveTerminalTab);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gitDiffOpen, setGitDiffOpen] = useState(false);
  const [customAgentOpen, setCustomAgentOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dismissedProjectError, setDismissedProjectError] = useState<string | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    let active = true;
    const fetchHealth = async () => {
      try {
        const result = await invoke<SystemHealth>("system_health");
        if (active) setHealth(result);
      } catch (e) {
        /* ignore */
      }
    };
    void fetchHealth();
    const timer = setInterval(() => void fetchHealth(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    void initializeProjects();
  }, [initializeProjects]);

  useEffect(() => {
    if (settings.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [settings.theme]);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }

    void initializeSessions(projects, hydrateWorkspace);
  }, [bootstrapped, hydrateWorkspace, initializeSessions, projects]);

  useEffect(() => {
    if (!sessionInitialized) {
      return;
    }

    syncProjects(projects);
    for (const project of projects) {
      ensureLayout(project.id);
    }
  }, [ensureLayout, projects, sessionInitialized, syncProjects]);

  useEffect(() => {
    if (!bootstrapped || !sessionInitialized) {
      return;
    }

    void persistSnapshot(openProjectIds, activeProjectId);
  }, [
    activeProjectId,
    bootstrapped,
    openProjectIds,
    projects,
    sessionInitialized,
    layouts,
    persistSnapshot,
    sessions,
    settings,
  ]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  useEffect(() => {
    if (activeProject) {
      clearProjectAttention(activeProject.id);
      // Auto-spawn intentionally disabled: user should manually click agents
    }
  }, [activeProject, clearProjectAttention]);

  // Keep a ref to the latest snapshot values so the close handler doesn't need to re-register.
  const snapshotRef = useRef({ openProjectIds, activeProjectId });
  useEffect(() => {
    snapshotRef.current = { openProjectIds, activeProjectId };
  }, [openProjectIds, activeProjectId]);

  // Register the window close handler ONCE after bootstrap.
  // NOTE: auto-save effect already persists state on every change,
  // so we do NOT need onCloseRequested at all — just let the OS close the window.
  useEffect(() => {
    if (!bootstrapped || !sessionInitialized) {
      return;
    }
    // Nothing needed — persistence is handled by the auto-save effect above.
  }, [bootstrapped, sessionInitialized]);

  // Keep a ref to latest state for keyboard shortcuts without re-registering.
  const shortcutStateRef = useRef({
    activeProject,
    activePaneIds,
    openProjectIds,
    activeProjectId,
    layouts,
  });
  useEffect(() => {
    shortcutStateRef.current = { activeProject, activePaneIds, openProjectIds, activeProjectId, layouts };
  }, [activeProject, activePaneIds, openProjectIds, activeProjectId, layouts]);

  // Register keyboard shortcuts ONCE.
  useEffect(() => {
    if (!bootstrapped || !sessionInitialized) {
      return;
    }

    const appWindow = getCurrentWindow();

    const onKeyDown = (event: KeyboardEvent) => {
      const { activeProject: proj, activePaneIds: paneIds, openProjectIds: openIds, activeProjectId: activeProjId, layouts: lays } = shortcutStateRef.current;

      // Ctrl+Q — quit app
      if (event.ctrlKey && event.code === "KeyQ") {
        event.preventDefault();
        void appWindow.close();
        return;
      }

      if (!proj) {
        return;
      }

      // Ctrl+Shift+T — new pane (vertical split)
      if (event.ctrlKey && event.shiftKey && event.code === "KeyT") {
        event.preventDefault();
        splitPane(proj.id, "vertical");
      }

      // Ctrl+Shift+W — kill focused session
      if (event.ctrlKey && event.shiftKey && event.code === "KeyW") {
        event.preventDefault();
        const activePaneId = paneIds[proj.id];
        if (!activePaneId) return;
        const pane = lays[proj.id]?.panes.find((entry) => entry.id === activePaneId);
        if (pane?.sessionId) {
          void useSessionStore.getState().killSession(proj.id, pane.sessionId);
        }
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle project tabs
      if (event.ctrlKey && event.code === "Tab") {
        event.preventDefault();
        if (openIds.length < 2 || !activeProjId) return;
        const currentIndex = openIds.indexOf(activeProjId);
        const delta = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + delta + openIds.length) % openIds.length;
        setActiveProject(openIds[nextIndex]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped, sessionInitialized]); // Intentionally minimal — reads latest state via ref



  const activeSessions = useMemo(
    () =>
      activeProject
        ? Object.values(sessions).filter(
            (session) => session.projectId === activeProject.id,
          )
        : [],
    [activeProject, sessions],
  );

  const launchAgent = useCallback((agentId: string, paneId?: string, projectOverride?: Project) => {
    const project = projectOverride ?? activeProject;
    if (!project) {
      return;
    }

    const agent = [...KNOWN_AGENTS, ...settings.customAgents].find(
      (entry) => entry.id === agentId,
    );
    if (!agent) {
      return;
    }

    void launchAgentForProject(project, agent, paneId);
  }, [activeProject, launchAgentForProject, settings.customAgents]);

  const runningCount = Object.values(sessions).filter(
    (session) => session.status === "running" || session.status === "starting",
  ).length;

  const projectCounts = useMemo(
    () =>
      Object.values(sessions).reduce<Record<string, number>>((acc, session) => {
        if (session.status === "running" || session.status === "starting" || session.status === "idle") {
          acc[session.projectId] = (acc[session.projectId] ?? 0) + 1;
        }
        return acc;
      }, {}),
    [sessions],
  );
  const searchResults = useMemo(
    () => searchLogs(searchQuery),
    [searchLogs, searchQuery],
  );

  return (
    <div className={`bg-background dark:bg-[#1a1a1a] text-on-surface dark:text-[#f5f0e8] font-body overflow-hidden h-screen flex flex-col ${settings.theme === "dark" ? "dark" : ""}`}>
      <Titlebar
        projects={projects}
        activeProjectId={activeProjectId}
        openProjectIds={openProjectIds}
        projectAttention={projectAttention}
        onSelectProject={setActiveProject}
        onOpenSettings={() => setSettingsOpen((open) => !open)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenGitDiff={() => setGitDiffOpen((open) => !open)}
      />
      <div className="flex flex-1 pt-16 overflow-hidden">
        <Sidebar
          projects={projects}
          activeProjectId={activeProjectId}
          projectCounts={projectCounts}
          onSelectProject={setActiveProject}
          onAddProject={openAddProject}
          onRemoveProject={removeProject}
          onOpenProject={(projectId) => {
            const project = projects.find((entry) => entry.id === projectId);
            if (project) {
              void openPath(project.path);
            }
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main className="flex-1 flex flex-col bg-[#e8e3da] dark:bg-[#1a1a1a] p-4 gap-4 overflow-hidden relative">
          <AgentBar
            project={activeProject}
            sessions={activeSessions}
            installedAgents={installedAgents}
            customAgents={settings.customAgents}
            onLaunchAgent={launchAgent}
            onFocusAgent={(sessionId) => {
              const session = sessions[sessionId];
              if (session) {
                focusPane(session.projectId, session.paneId);
              }
            }}
            onSplit={(orientation) => {
              if (activeProject) {
                splitPane(activeProject.id, orientation);
              }
            }}
            onAddCustomAgent={() => setCustomAgentOpen(true)}
          />

          <section className="flex-1 min-h-0 relative">
            {loading && !bootstrapped ? (
              <div className="flex flex-col items-center justify-center h-full bg-[#f5f0e8] border-4 border-[#1a1a1a] neo-shadow">
                <p className="font-['Space_Grotesk'] font-bold text-xl">Loading saved projects...</p>
              </div>
            ) : activeProject ? (
              // Render ALL project grids so terminals stay alive when switching project tabs.
              // Only the active project is visible; others are hidden but kept mounted.
              <>
                {projects.map((project) => {
                  const tabs = terminalTabs[project.id] ?? [{ id: project.id, projectId: project.id, label: "Terminal 1", createdAt: 0 }];
                  const activeTabId = activeTabIds[project.id] ?? tabs[0]?.id ?? project.id;
                  const isVisible = project.id === activeProject.id;
                  return (
                    <div
                      key={project.id}
                      className="absolute inset-0 flex flex-col"
                      style={{ display: isVisible ? "flex" : "none" }}
                    >
                      {/* Terminal tab bar — one row of tabs per project */}
                      <TerminalTabBar
                        tabs={tabs}
                        activeTabId={activeTabId}
                        onSelectTab={(tabId) => setActiveTerminalTab(project.id, tabId)}
                        onAddTab={() => addTerminalTab(project.id)}
                        onCloseTab={(tabId) => closeTerminalTab(project.id, tabId)}
                      />

                      {/* Kanban board — rendered when kanban tab is active */}
                      {activeTabId === KANBAN_TAB_ID ? (
                        <div className="flex-1 min-h-0">
                          <KanbanBoard projectId={project.id} projectName={project.name} />
                        </div>
                      ) : (
                        /* Terminal pane grids — each tab keeps its own grid mounted.
                           display:none hides inactive tabs cleanly (no layout disruption).
                           isTabActive is passed down so TerminalView can re-fit when
                           the tab becomes visible. */
                        tabs.map((tab) => (
                          <div
                            key={tab.id}
                            className="flex-1 min-h-0 relative"
                            style={{ display: tab.id === activeTabId ? "block" : "none" }}
                          >
                            <PaneGrid
                              project={project}
                              layoutKey={tab.id}
                              isTabActive={tab.id === activeTabId}
                              onLaunchAgent={(agentId, paneId) => launchAgent(agentId, paneId, project)}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full bg-[#f5f0e8] dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] border-dashed p-8 text-center gap-6">
                <div className="bg-white dark:bg-[#121212] border-2 border-[#1a1a1a] dark:border-[#f5f0e8] p-4 neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8]">
                  <span className="material-symbols-outlined text-5xl text-[#1a1a1a] dark:text-[#f5f0e8]">smart_toy</span>
                </div>
                <div>
                  <h3 className="font-['Space_Grotesk'] font-black text-2xl uppercase mb-2 text-[#1a1a1a] dark:text-[#f5f0e8]">Welcome to Nexus</h3>
                  <p className="font-body text-sm text-[#4a4a4a] dark:text-[#a0a0a0]">Start with a project. Add a repo to begin.</p>
                </div>
                <button
                  className="bg-[#ffcc00] dark:bg-[#ffcc00] text-[#1a1a1a] dark:text-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] py-3 px-6 font-['Space_Grotesk'] font-black uppercase neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8] hover:translate-x-[2px] transition-all"
                  onClick={openAddProject}
                  type="button"
                >
                  + Add project
                </button>
              </div>
            )}

            {projectError && projectError !== dismissedProjectError ? (
              <div className="absolute bottom-4 left-4 right-4 z-50 border-4 border-[#1a1a1a] bg-[#e63b2e] text-white p-4 font-bold neo-shadow flex items-center justify-between gap-4">
                <span>{projectError}</span>
                <button
                  className="shrink-0 text-white hover:text-[#1a1a1a] hover:bg-white border-2 border-white hover:border-[#1a1a1a] w-7 h-7 flex items-center justify-center font-black text-sm transition-colors"
                  onClick={() => setDismissedProjectError(projectError)}
                  title="Dismiss"
                  type="button"
                >×</button>
              </div>
            ) : null}
            {sessionError ? (
              <div className="absolute bottom-20 left-4 right-4 z-50 border-4 border-[#1a1a1a] bg-[#e63b2e] text-white p-4 font-bold neo-shadow flex items-center justify-between gap-4">
                <span>{sessionError}</span>
                <button
                  className="shrink-0 text-white hover:text-[#1a1a1a] hover:bg-white border-2 border-white hover:border-[#1a1a1a] w-7 h-7 flex items-center justify-center font-black text-sm transition-colors"
                  onClick={() => useSessionStore.getState().clearError?.()}
                  title="Dismiss"
                  type="button"
                >×</button>
              </div>
            ) : null}
          </section>
        </main>
      </div>

      <StatusBar
        project={activeProject}
        runningCount={runningCount}
        runtimeInfo={runtimeInfo}
        health={health}
      />

      {isAddProjectOpen ? (
        <AddProjectDialog
          onClose={closeAddProject}
          onSubmit={addProject}
        />
      ) : null}

      {customAgentOpen ? (
        <AddCustomAgentDialog
          onClose={() => setCustomAgentOpen(false)}
          onSubmit={(agent) => {
            const deduped = settings.customAgents.filter(
              (entry) =>
                !(
                  entry.name.toLowerCase() === agent.name.toLowerCase() &&
                  entry.command === agent.command
                ),
            );
            upsertSettings({
              customAgents: [...deduped, agent],
            });
            setCustomAgentOpen(false);
          }}
        />
      ) : null}

      <div className={`fixed inset-0 z-[70] flex justify-end transition-all duration-300 ${settingsOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        {/* Overlay Backdrop */}
        <div 
          className={`absolute inset-0 bg-[#1a1a1a]/40 dark:bg-black/80 backdrop-blur-sm transition-opacity duration-300 ${settingsOpen ? 'opacity-100' : 'opacity-0'}`} 
          onClick={() => setSettingsOpen(false)}
        />
        
        {/* Side Panel */}
        <div className={`relative w-full max-w-xl bg-background dark:bg-[#1a1a1a] border-l-8 border-[#1a1a1a] dark:border-[#f5f0e8] h-full shadow-2xl flex flex-col transition-transform duration-300 ${settingsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {/* Panel Header */}
          <div className="p-8 border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#1a1a1a] flex justify-between items-start shrink-0">
            <h1 className="font-headline font-black text-7xl md:text-8xl leading-none tracking-tighter text-[#1a1a1a] dark:text-[#f5f0e8]">
              SETTINGS
            </h1>
            <button 
              className="border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-2 hover:bg-[#e63b2e] hover:text-white dark:text-[#f5f0e8] transition-none active:translate-x-[2px] active:translate-y-[2px]"
              onClick={() => setSettingsOpen(false)}
            >
              <span className="material-symbols-outlined font-black">close</span>
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-8 space-y-12 pb-32 text-[#1a1a1a] dark:text-[#f5f0e8]">
            
            {/* Section: APPEARANCE */}
            <section className="space-y-6">
              <div className="flex items-center gap-4 text-[#1a1a1a] dark:text-[#f5f0e8]">
                <span className="w-12 h-4 bg-[#e63b2e]"></span>
                <h2 className="font-headline font-black text-3xl uppercase">APPEARANCE</h2>
              </div>
              
              <div className="grid gap-8 border-l-4 border-[#1a1a1a] dark:border-[#f5f0e8] pl-6 ml-6">
                
                <div className="space-y-3">
                  <label className="font-headline font-bold text-sm uppercase tracking-widest text-[#4a4a4a] dark:text-[#a0a0a0]">Theme</label>
                  <BrutalistDropdown 
                    value={settings.theme} 
                    options={[
                      { label: "DARK", value: "dark" }, 
                      { label: "LIGHT", value: "light" }
                    ]} 
                    onChange={(val) => upsertSettings({ theme: val as "dark" | "light" })} 
                  />
                </div>

                <div className="space-y-3">
                  <label className="font-headline font-bold text-sm uppercase tracking-widest text-[#4a4a4a] dark:text-[#a0a0a0]">Font Family</label>
                  <BrutalistDropdown 
                    value={settings.fontFamily} 
                    options={[
                      { label: "JetBrains Mono", value: "JetBrains Mono" }, 
                      { label: "Fira Code", value: "Fira Code" },
                      { label: "Cascadia Code", value: "Cascadia Code" },
                      { label: "monospace", value: "monospace" }
                    ]} 
                    onChange={(val) => upsertSettings({ fontFamily: val })} 
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <label className="font-headline font-bold text-sm uppercase tracking-widest text-[#4a4a4a] dark:text-[#a0a0a0]">Font Size</label>
                    <span className="font-mono font-black text-xl text-[#1a1a1a] dark:text-[#f5f0e8]">{settings.fontSize}PX</span>
                  </div>
                  <input 
                    className="w-full h-8 bg-[#e8e3da] dark:bg-[#2a2a2a] border-4 border-primary dark:border-[#f5f0e8] appearance-none cursor-pointer accent-[#ffcc00] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-full [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:bg-primary dark:[&::-webkit-slider-thumb]:bg-[#f5f0e8]" 
                    type="range" 
                    min={11} 
                    max={16} 
                    value={settings.fontSize}
                    onChange={(event) => upsertSettings({ fontSize: Number(event.target.value) })}
                  />
                </div>
              </div>
            </section>

            {/* Section: TERMINAL */}
            <section className="space-y-6">
              <div className="flex items-center gap-4 text-[#1a1a1a] dark:text-[#f5f0e8]">
                <span className="w-12 h-4 bg-[#0055ff]"></span>
                <h2 className="font-headline font-black text-3xl uppercase">TERMINAL</h2>
              </div>
              
              <div className="grid gap-8 border-l-4 border-[#1a1a1a] dark:border-[#f5f0e8] pl-6 ml-6">
                
                <div className="space-y-3">
                  <label className="font-headline font-bold text-sm uppercase tracking-widest text-[#4a4a4a] dark:text-[#a0a0a0]">Scrollback lines</label>
                  <input 
                    className="w-full border-4 border-primary dark:border-[#f5f0e8] p-4 font-mono text-lg bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] focus:ring-0 focus:outline-none focus:border-[#ffcc00] dark:focus:border-[#ffcc00]" 
                    type="number" 
                    min={1000}
                    max={50000}
                    value={settings.scrollback}
                    onChange={(event) => upsertSettings({ scrollback: Number(event.target.value) })}
                  />
                </div>

                <div className="space-y-3">
                  <label className="font-headline font-bold text-sm uppercase tracking-widest text-[#4a4a4a] dark:text-[#a0a0a0]">Cursor Style</label>
                  <div className="flex flex-wrap gap-4">
                    {(["block", "bar", "underline"] as const).map((style) => (
                      <button 
                        key={style}
                        type="button"
                        onClick={() => upsertSettings({ cursorStyle: style })}
                        className={`border-4 border-primary dark:border-[#f5f0e8] px-6 py-2 font-headline font-black transition-none uppercase ${
                          settings.cursorStyle === style ? 'bg-[#ffcc00] text-[#1a1a1a] dark:bg-[#ffcc00] dark:text-[#1a1a1a]' : 'bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-primary-container dark:hover:bg-[#2a2a2a]'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="font-headline font-bold text-sm uppercase tracking-widest text-[#4a4a4a] dark:text-[#a0a0a0]">Shell Override</label>
                  <input 
                    className="w-full border-4 border-primary dark:border-[#f5f0e8] p-4 font-mono text-lg bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] focus:ring-0 focus:outline-none focus:border-[#ffcc00] dark:focus:border-[#ffcc00]" 
                    type="text" 
                    placeholder="Leave blank to auto-detect"
                    value={settings.shellOverride}
                    onChange={(event) => upsertSettings({ shellOverride: event.target.value })}
                  />
                </div>

              </div>
            </section>

            {/* Section: AGENTS */}
            <section className="space-y-6">
              <div className="flex items-center gap-4 text-[#1a1a1a] dark:text-[#f5f0e8]">
                <span className="w-12 h-4 bg-[#ffcc00]"></span>
                <h2 className="font-headline font-black text-3xl uppercase">AGENTS</h2>
              </div>
              
              <div className="grid gap-6 border-l-4 border-[#1a1a1a] dark:border-[#f5f0e8] pl-6 ml-6">
                
                <div className="p-4 border-4 border-primary dark:border-[#f5f0e8] bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8]">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-headline font-black uppercase">Claude Code</h4>
                    <span className="material-symbols-outlined text-[#e63b2e]">smart_toy</span>
                  </div>
                  <label className="block font-mono text-xs mb-2 text-[#4a4a4a] dark:text-[#a0a0a0]">DEFAULT ARGS</label>
                  <textarea 
                    className="w-full border-2 border-primary dark:border-[#f5f0e8] p-2 font-mono text-sm bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] focus:ring-0 focus:outline-none focus:border-[#ffcc00] dark:focus:border-[#ffcc00] h-20"
                    value={settings.defaultAgentArgs["claude-code"] ?? ""}
                    onChange={(event) => upsertSettings({ defaultAgentArgs: { "claude-code": event.target.value } })}
                  />
                </div>

                <div className="p-4 border-4 border-primary dark:border-[#f5f0e8] bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8]">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-headline font-black uppercase">Codex</h4>
                    <span className="material-symbols-outlined text-[#e63b2e]">smart_toy</span>
                  </div>
                  <label className="block font-mono text-xs mb-2 text-[#4a4a4a] dark:text-[#a0a0a0]">DEFAULT ARGS</label>
                  <textarea 
                    className="w-full border-2 border-primary dark:border-[#f5f0e8] p-2 font-mono text-sm bg-white dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] focus:ring-0 focus:outline-none focus:border-[#ffcc00] dark:focus:border-[#ffcc00] h-20"
                    value={settings.defaultAgentArgs.codex ?? ""}
                    onChange={(event) => upsertSettings({ defaultAgentArgs: { codex: event.target.value } })}
                  />
                </div>

              </div>
            </section>

            {/* Section: SESSION */}
            <section className="space-y-6">
              <div className="flex items-center gap-4 text-[#1a1a1a] dark:text-[#f5f0e8]">
                <span className="w-12 h-4 bg-[#1a1a1a] dark:bg-[#f5f0e8]"></span>
                <h2 className="font-headline font-black text-3xl uppercase">SESSION</h2>
              </div>
              
              <div className="grid gap-8 border-l-4 border-[#1a1a1a] dark:border-[#f5f0e8] pl-6 ml-6">
                
                <div className="flex justify-between items-center p-4 bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a] border-4 border-primary dark:border-[#f5f0e8] cursor-pointer" onClick={() => upsertSettings({ restoreSessions: !settings.restoreSessions })}>
                  <div>
                    <p className="font-headline font-black uppercase">Restore on startup</p>
                    <p className="text-xs font-mono opacity-70">Automatically reload previous terminal tabs</p>
                  </div>
                  <div className="w-14 h-8 bg-white border-2 border-primary dark:border-[#1a1a1a] relative">
                    <div className={`absolute top-[2px] bottom-[2px] w-6 border-2 border-primary dark:border-[#1a1a1a] transition-all duration-200 ${settings.restoreSessions ? 'right-[2px] bg-[#ffcc00]' : 'left-[2px] bg-[#1a1a1a]'}`}></div>
                  </div>
                </div>

                <div className="p-4 border-4 border-primary dark:border-[#f5f0e8] bg-[#e8e3da] dark:bg-[#2a2a2a] relative mt-8">
                  <span className="absolute -top-3 left-4 bg-white dark:bg-[#1a1a1a] border-2 border-[#1a1a1a] dark:border-[#f5f0e8] px-2 font-headline font-black text-xs uppercase pt-0.5 tracking-widest text-[#1a1a1a] dark:text-[#f5f0e8]">Keybindings</span>
                  <ul className="font-body opacity-80 list-disc pl-4 space-y-2 text-sm text-[#1a1a1a] dark:text-[#f5f0e8]">
                    <li><kbd className="font-mono font-bold bg-[#1a1a1a] dark:bg-[#f5f0e8] text-[#00ff00] dark:text-[#008800] px-2 py-0.5 shadow-[2px_2px_0px_0px_#1a1a1a] dark:shadow-[2px_2px_0px_0px_#f5f0e8]">Ctrl+Shift+C</kbd> Copy</li>
                    <li><kbd className="font-mono font-bold bg-[#1a1a1a] dark:bg-[#f5f0e8] text-[#00ff00] dark:text-[#008800] px-2 py-0.5 shadow-[2px_2px_0px_0px_#1a1a1a] dark:shadow-[2px_2px_0px_0px_#f5f0e8]">Ctrl+Shift+V</kbd> Paste</li>
                    <li><kbd className="font-mono font-bold bg-[#1a1a1a] dark:bg-[#f5f0e8] text-[#00ff00] dark:text-[#008800] px-2 py-0.5 shadow-[2px_2px_0px_0px_#1a1a1a] dark:shadow-[2px_2px_0px_0px_#f5f0e8]">Ctrl+Shift+T</kbd> New pane</li>
                    <li><kbd className="font-mono font-bold bg-[#1a1a1a] dark:bg-[#f5f0e8] text-[#00ff00] dark:text-[#008800] px-2 py-0.5 shadow-[2px_2px_0px_0px_#1a1a1a] dark:shadow-[2px_2px_0px_0px_#f5f0e8]">Ctrl+Shift+W</kbd> Close pane</li>
                    <li><kbd className="font-mono font-bold bg-[#1a1a1a] dark:bg-[#f5f0e8] text-[#00ff00] dark:text-[#008800] px-2 py-0.5 shadow-[2px_2px_0px_0px_#1a1a1a] dark:shadow-[2px_2px_0px_0px_#f5f0e8]">Ctrl+wheel</kbd> zoom active pane</li>
                  </ul>
                </div>

              </div>
            </section>
          </div>

          {/* Footer Actions */}
          <div className="p-8 border-t-8 border-[#1a1a1a] dark:border-[#f5f0e8] bg-surface-container dark:bg-[#1a1a1a] flex gap-4 shrink-0">
            <button 
              className="flex-1 bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a] py-6 font-headline font-black text-2xl uppercase border-4 border-[#1a1a1a] dark:border-[#f5f0e8] hover:bg-white dark:hover:bg-[#e63b2e] hover:text-[#1a1a1a] dark:hover:text-white transition-none active:translate-x-[4px] active:translate-y-[4px] active:shadow-none shadow-[6px_6px_0px_0px_#e63b2e] dark:shadow-[6px_6px_0px_0px_#ffcc00]"
              onClick={() => setSettingsOpen(false)}
            >
              SAVE CHANGES
            </button>
            <button 
              className="w-20 border-4 border-[#1a1a1a] dark:border-[#f5f0e8] flex items-center justify-center hover:bg-[#ffcc00] dark:hover:bg-[#ffcc00] dark:hover:text-[#1a1a1a] bg-transparent dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] transition-none"
              onClick={() => window.location.reload()}
            >
              <span className="material-symbols-outlined font-black text-3xl">refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Git Diff Panel */}
      <GitDiffPanel
        open={gitDiffOpen}
        project={activeProject}
        onClose={() => setGitDiffOpen(false)}
      />

      {searchOpen ? (
        <LogSearchDialog
          query={searchQuery}
          results={searchResults}
          onQueryChange={setSearchQuery}
          onClose={() => setSearchOpen(false)}
          onOpenSession={(sessionId) => {
            const session = sessions[sessionId];
            if (!session) {
              return;
            }
            setActiveProject(session.projectId);
            focusPane(session.projectId, session.paneId);
            setSearchOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

export default App;
