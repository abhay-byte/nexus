import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { PaneGrid } from "./components/PaneGrid/PaneGrid";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { Titlebar } from "./components/Titlebar/Titlebar";

import { AddProjectDialog } from "./components/dialogs/AddProjectDialog";
import { AddCustomAgentDialog } from "./components/dialogs/AddCustomAgentDialog";
import { LogSearchDialog } from "./components/dialogs/LogSearchDialog";
import { SettingsWorkspace } from "./components/settings/SettingsWorkspace";
import { TerminalTabBar, KANBAN_TAB_ID } from "./components/TerminalTabBar/TerminalTabBar";
import { KanbanBoard } from "./components/Kanban/KanbanBoard";
import { GitDiffPanel } from "./components/GitDiffPanel/GitDiffPanel";
import { ProjectDirectoryPanel } from "./components/ProjectDirectoryPanel/ProjectDirectoryPanel";
import { ResourceMonitorPanel } from "./components/ResourceMonitorPanel/ResourceMonitorPanel";
import { KNOWN_AGENTS } from "./constants/agents";
import { matchesKeybinding } from "./constants/keybindings";
import { syncProjectMcpFiles } from "./lib/projectMcpSync";
import { useProjectStore } from "./store/projectStore";
import { useSessionStore } from "./store/sessionStore";

interface GitStatusSummary {
  count: number;
  branch: string;
}
interface AgencyAgentOption {
  slug: string;
  name: string;
  category: string;
}
import type { AddProjectDraft, Project, SystemHealth } from "./types";

function isRemoteProjectPath(path: string) {
  return /^[^@:\s]+@[^:\s]+:.+$/.test(path);
}

async function readAgencyManifestSlug(projectPath: string) {
  try {
    const root = projectPath.replace(/[\\/]+$/, "");
    const contents = await readTextFile(`${root}/.nexus/agency-agents.json`);
    const parsed = JSON.parse(contents) as { slug?: unknown };
    return typeof parsed.slug === "string" ? parsed.slug : null;
  } catch {
    return null;
  }
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
  const updateProject = useProjectStore((state) => state.updateProject);
  const removeProject = useProjectStore((state) => state.removeProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const closeProjectTab = useProjectStore((state) => state.closeProjectTab);
  const hydrateWorkspace = useProjectStore((state) => state.hydrateWorkspace);
  const bumpProjectToTop = useProjectStore((state) => state.bumpProjectToTop);
  const reorderProjects = useProjectStore((state) => state.reorderProjects);

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
  const [resourceMonitorOpen, setResourceMonitorOpen] = useState(false);
  const toggleResourceMonitor = useCallback(() => setResourceMonitorOpen((open) => !open), []);
  const [gitDiffOpen, setGitDiffOpen] = useState(false);
  const [customAgentOpen, setCustomAgentOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dismissedProjectError, setDismissedProjectError] = useState<string | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatusSummary | null>(null);
  const closeGitDiff = useCallback(() => setGitDiffOpen(false), []);
  const toggleGitDiff = useCallback(() => setGitDiffOpen((open) => !open), []);

  const [projectPanelCollapsed, setProjectPanelCollapsed] = useState(false);
  const [projectPanelWidth, setProjectPanelWidth] = useState(240);
  const [resourceMonitorWidth, setResourceMonitorWidth] = useState(380);
  const [gitDiffWidth, setGitDiffWidth] = useState(480);
  const [rightPanelTab, setRightPanelTab] = useState<"git" | "monitor">("git");
  const toggleProjectPanel = useCallback(() => setProjectPanelCollapsed((v) => !v), []);

  const sidebarCollapsed = settings.sidebarCollapsed;
  const sidebarWidth = settings.sidebarWidth;
  const toggleSidebar = useCallback(() => {
    upsertSettings({ sidebarCollapsed: !sidebarCollapsed });
  }, [sidebarCollapsed, upsertSettings]);
  const setSidebarWidth = useCallback((width: number) => {
    upsertSettings({ sidebarWidth: width });
  }, [upsertSettings]);

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

    void Promise.allSettled(
      projects.map((project) => syncProjectMcpFiles(project, settings.mcpServers)),
    );
  }, [bootstrapped, projects, sessionInitialized, settings.mcpServers]);


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

  // Auto-bump projects with running agents to the top of the sidebar.
  useEffect(() => {
    if (!sessionInitialized) return;
    const runningProjectIds = new Set(
      Object.values(sessions)
        .filter((s) => s.status === "running" || s.status === "starting")
        .map((s) => s.projectId),
    );
    for (const projectId of runningProjectIds) {
      void bumpProjectToTop(projectId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionInitialized, sessions]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  useEffect(() => {
    if (!activeProject) {
      setGitStatus(null);
      return;
    }
    let active = true;
    setGitStatus(null); // Clear stale count while fetching
    const fetchStatus = async () => {
      try {
        const status = await invoke<GitStatusSummary>("git_status_count", { cwd: activeProject.path });
        if (active) setGitStatus(status);
      } catch (e) {
        if (active) setGitStatus(null);
      }
    };
    void fetchStatus();
    // Poll every 5s. Also refetches whenever activeProject changes.
    const timer = setInterval(() => void fetchStatus(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [activeProject]);

  useEffect(() => {
    if (activeProject) {
      clearProjectAttention(activeProject.id);
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
    const kb = settings.keybindings ?? {};

    const onKeyDown = (event: KeyboardEvent) => {
      const { activeProject: proj, activePaneIds: paneIds, openProjectIds: openIds, activeProjectId: activeProjId, layouts: lays } = shortcutStateRef.current;

      // Application shortcuts
      if (matchesKeybinding(event, kb.quit)) {
        event.preventDefault();
        void appWindow.close();
        return;
      }

      if (matchesKeybinding(event, kb.toggleSidebar)) {
        event.preventDefault();
        toggleSidebar();
        return;
      }

      if (matchesKeybinding(event, kb.toggleProjectPanel)) {
        event.preventDefault();
        toggleProjectPanel();
        return;
      }

      if (matchesKeybinding(event, kb.toggleGitDiff)) {
        event.preventDefault();
        toggleGitDiff();
        return;
      }

      if (matchesKeybinding(event, kb.toggleSettings)) {
        event.preventDefault();
        setSettingsOpen((open) => !open);
        return;
      }

      if (matchesKeybinding(event, kb.toggleSearch)) {
        event.preventDefault();
        setSearchOpen((open) => !open);
        return;
      }

      if (!proj) {
        return;
      }

      // Terminal shortcuts
      if (matchesKeybinding(event, kb.splitVertical)) {
        event.preventDefault();
        splitPane(proj.id, "vertical");
        return;
      }

      if (matchesKeybinding(event, kb.splitHorizontal)) {
        event.preventDefault();
        splitPane(proj.id, "horizontal");
        return;
      }

      if (matchesKeybinding(event, kb.killFocusedSession)) {
        event.preventDefault();
        const activePaneId = paneIds[proj.id];
        if (!activePaneId) return;
        const pane = lays[proj.id]?.panes.find((entry) => entry.id === activePaneId);
        if (pane?.sessionId) {
          void useSessionStore.getState().killSession(proj.id, pane.sessionId);
        }
        return;
      }

      if (matchesKeybinding(event, kb.newTerminalTab)) {
        event.preventDefault();
        addTerminalTab(proj.id);
        return;
      }

      if (matchesKeybinding(event, kb.closeTerminalTab)) {
        event.preventDefault();
        const tabs = useSessionStore.getState().terminalTabs[proj.id] ?? [];
        const activeTabId = useSessionStore.getState().activeTabIds[proj.id];
        if (tabs.length > 1 && activeTabId) {
          closeTerminalTab(proj.id, activeTabId);
        }
        return;
      }

      // Navigation shortcuts
      if (matchesKeybinding(event, kb.nextProjectTab)) {
        event.preventDefault();
        if (openIds.length < 2 || !activeProjId) return;
        const currentIndex = openIds.indexOf(activeProjId);
        const nextIndex = (currentIndex + 1 + openIds.length) % openIds.length;
        setActiveProject(openIds[nextIndex]);
        return;
      }

      if (matchesKeybinding(event, kb.prevProjectTab)) {
        event.preventDefault();
        if (openIds.length < 2 || !activeProjId) return;
        const currentIndex = openIds.indexOf(activeProjId);
        const nextIndex = (currentIndex - 1 + openIds.length) % openIds.length;
        setActiveProject(openIds[nextIndex]);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped, sessionInitialized, settings.keybindings]); // Intentionally minimal state ref — keybindings change is OK to re-register



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

  const launchShell = useCallback((paneId?: string, projectOverride?: Project) => {
    const project = projectOverride ?? activeProject;
    if (!project) {
      return;
    }
    void useSessionStore.getState().launchShell(project, paneId);
  }, [activeProject]);

  const handleRemoveProject = useCallback(async (projectId: string) => {
    await killSessionsForProject(projectId);
    await removeProject(projectId);
  }, [killSessionsForProject, removeProject]);

  const handleOpenProjectPath = useCallback((path: string) => {
    void invoke("open_in_file_manager", { path });
  }, []);

  const handleBootstrapSpecKit = useCallback((projectPath: string, agentId: string) => {
    return invoke<string>("bootstrap_spec_kit", { projectPath, agentId });
  }, []);

  const handleInstallCaveman = useCallback((agentId: string) => {
    return invoke<string>("install_caveman", { agentId });
  }, []);

  const handleListAgencyAgents = useCallback(() => {
    return invoke<AgencyAgentOption[]>("list_agency_agents");
  }, []);

  const handleSyncProjectAgencyAgent = useCallback(
    (projectPath: string, slug: string, enabled: boolean, category?: string) => {
      return invoke<string>("sync_project_agency_agent", { projectPath, slug, enabled, category });
    },
    [],
  );

  const handleAddProjectSubmit = useCallback(
    async (draft: AddProjectDraft) => {
      const project = await addProject(draft);

      // Agency sync
      if (draft.agencyAgent?.enabled && draft.agencyAgent.selectedAgentSlug) {
        await handleSyncProjectAgencyAgent(
          project.path,
          draft.agencyAgent.selectedAgentSlug,
          true,
          draft.category,
        ).catch(() => undefined);
      }

      // Spec Kit bootstrap
      if (draft.specKit?.enabled && draft.specKit.agentId) {
        await handleBootstrapSpecKit(project.path, draft.specKit.agentId).catch(() => undefined);
      }

      // Caveman install
      for (const agentId of draft.cavemanAgentIds) {
        await handleInstallCaveman(agentId).catch(() => undefined);
        if (!settings.cavemanInstalledAgentIds?.includes(agentId)) {
          upsertSettings({
            cavemanInstalledAgentIds: [
              ...(settings.cavemanInstalledAgentIds ?? []),
              agentId,
            ],
          });
        }
      }
    },
    [addProject, handleSyncProjectAgencyAgent, handleBootstrapSpecKit, handleInstallCaveman, upsertSettings, settings.cavemanInstalledAgentIds],
  );

  useEffect(() => {
    if (!bootstrapped || !sessionInitialized) {
      return;
    }

    let cancelled = false;
    void (async () => {
      for (const project of projects) {
        if (cancelled) {
          return;
        }
        if (!project.agencyAgent?.enabled || isRemoteProjectPath(project.path)) {
          continue;
        }

        const root = project.path.replace(/[\\/]+$/, "");
        const [hasAgencyFile, hasLegacyAgencyFile, manifestSlug] = await Promise.all([
          exists(`${root}/AGENCY.md`),
          exists(`${root}/.nexus/agency-agent.md`),
          readAgencyManifestSlug(project.path),
        ]);

        if (
          hasAgencyFile &&
          !hasLegacyAgencyFile &&
          manifestSlug === project.agencyAgent.selectedAgentSlug
        ) {
          continue;
        }

        await handleSyncProjectAgencyAgent(
          project.path,
          project.agencyAgent.selectedAgentSlug,
          true,
          project.category,
        ).catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrapped, handleSyncProjectAgencyAgent, projects, sessionInitialized]);

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
      <Titlebar sidebarCollapsed={sidebarCollapsed} />
      <div className={`flex flex-1 overflow-hidden ${sidebarCollapsed ? "pt-10" : "pt-16"}`}>
        <Sidebar
          projects={projects}
          activeProjectId={activeProjectId}
          projectCounts={projectCounts}
          collapsed={sidebarCollapsed}
          width={sidebarWidth}
          onSelectProject={setActiveProject}
          onAddProject={openAddProject}
          onRemoveProject={handleRemoveProject}
          onOpenProject={(projectId) => {
            const project = projects.find((entry) => entry.id === projectId);
            if (project) {
              handleOpenProjectPath(project.path);
            }
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleCollapse={toggleSidebar}
          onResizeWidth={setSidebarWidth}
          onReorderProjects={reorderProjects}
        />

        <main className="flex-1 flex flex-col bg-[#e8e3da] dark:bg-[#1a1a1a] p-2 gap-2 overflow-hidden relative">
          <section className="flex-1 min-h-0 flex flex-row overflow-hidden relative">
            <ProjectDirectoryPanel
              project={activeProject}
              collapsed={projectPanelCollapsed}
              width={projectPanelWidth}
              onToggleCollapse={toggleProjectPanel}
              onResizeWidth={setProjectPanelWidth}
            />
            <div className="flex-1 min-h-0 relative">
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
                        onSplitHorizontal={() => splitPane(project.id, "horizontal")}
                        onSplitVertical={() => splitPane(project.id, "vertical")}
                        gitStatus={gitStatus}
                        onOpenSearch={() => setSearchOpen(true)}
                        onOpenGitDiff={toggleGitDiff}
                        onOpenSettings={() => setSettingsOpen((open) => !open)}
                        onToggleProjectPanel={toggleProjectPanel}
                        onToggleResourceMonitor={toggleResourceMonitor}
                        resourceMonitorActive={resourceMonitorOpen}
                        agencyAgent={project.agencyAgent}
                        onUpdateAgencyAgent={(patch) => void updateProject(project.id, { agencyAgent: { enabled: project.agencyAgent?.enabled ?? false, selectedAgentSlug: project.agencyAgent?.selectedAgentSlug ?? "agents-orchestrator", ...patch } })}
                        onListAgencyAgents={handleListAgencyAgents}
                        onSyncProjectAgencyAgent={(slug, enabled) => handleSyncProjectAgencyAgent(project.path, slug, enabled, project.category)}
                      />

                        <div
                          className="flex-1 min-h-0"
                          style={{ display: activeTabId === KANBAN_TAB_ID ? "block" : "none" }}
                        >
                          <KanbanBoard projectId={project.id} projectName={project.name} />
                        </div>

                        {/* Keep every terminal tab mounted even while Kanban is visible.
                           xterm's buffer lives in the mounted component tree, so unmounting
                           the grid clears the visible terminal even though the PTY keeps running. */}
                        {tabs.map((tab) => (
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
                              onLaunchShell={(paneId) => launchShell(paneId, project)}
                            />
                          </div>
                        ))}
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

            </div>

            {/* Right panel: Git Diff + Resource Monitor (tabbed when both open) */}
            {(gitDiffOpen || resourceMonitorOpen) && (
              <div className="flex flex-col h-full shrink-0">
                {/* Tabs */}
                {gitDiffOpen && resourceMonitorOpen && (
                  <div className="flex border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#e8e3da] dark:bg-[#252525] shrink-0">
                    <button
                      type="button"
                      onClick={() => setRightPanelTab("git")}
                      className={`flex-1 px-3 py-2 font-mono text-[10px] font-bold uppercase border-r-2 border-[#1a1a1a] dark:border-[#f5f0e8] ${
                        rightPanelTab === "git"
                          ? "bg-[#ffcc00] text-[#1a1a1a]"
                          : "text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-white dark:hover:bg-[#1a1a1a]"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px] align-middle mr-1">difference</span>
                      Git Diff
                    </button>
                    <button
                      type="button"
                      onClick={() => setRightPanelTab("monitor")}
                      className={`flex-1 px-3 py-2 font-mono text-[10px] font-bold uppercase ${
                        rightPanelTab === "monitor"
                          ? "bg-[#ffcc00] text-[#1a1a1a]"
                          : "text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-white dark:hover:bg-[#1a1a1a]"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px] align-middle mr-1">bar_chart</span>
                      Resources
                    </button>
                  </div>
                )}

                {/* Content */}
                {gitDiffOpen && (!resourceMonitorOpen || rightPanelTab === "git") && (
                  <GitDiffPanel
                    open={gitDiffOpen}
                    project={activeProject}
                    onClose={closeGitDiff}
                    width={gitDiffWidth}
                    onResizeWidth={setGitDiffWidth}
                  />
                )}
                {resourceMonitorOpen && (!gitDiffOpen || rightPanelTab === "monitor") && (
                  <ResourceMonitorPanel
                    open={resourceMonitorOpen}
                    onClose={() => setResourceMonitorOpen(false)}
                    health={health}
                    width={resourceMonitorWidth}
                    onResizeWidth={setResourceMonitorWidth}
                  />
                )}
              </div>
            )}
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
          onSubmit={handleAddProjectSubmit}
          onListAgencyAgents={handleListAgencyAgents}
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

      <SettingsWorkspace
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        settings={settings}
        installedAgents={installedAgents}
        runtimeInfo={runtimeInfo}
        onOpenAddProject={openAddProject}
        onUpdateProject={updateProject}
        onRemoveProject={handleRemoveProject}
        onOpenProjectPath={handleOpenProjectPath}
        onUpdateSettings={upsertSettings}
        onOpenAddCustomAgent={() => setCustomAgentOpen(true)}
        onBootstrapSpecKit={handleBootstrapSpecKit}
        onInstallCaveman={handleInstallCaveman}
        onListAgencyAgents={handleListAgencyAgents}
        onSyncProjectAgencyAgent={handleSyncProjectAgencyAgent}
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
