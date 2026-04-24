import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";
import { create } from "zustand";
import { KNOWN_AGENTS } from "../constants/agents";
import { createDefaultLayout, createPane, normalizeFractions } from "../lib/layout";
import {
  buildProjectAgentLaunchOverrides,
  migrateLegacyProjectMcpServers,
} from "../lib/projectMcpSync";
import { DEFAULT_SETTINGS, exportLogFile, loadSessions, saveSessions } from "../lib/persistence";
import type {
  AgentConfig,
  AppSettings,
  InstalledAgentStatus,
  LogSearchResult,
  Project,
  ProjectLayout,
  RuntimeInfo,
  Session,
  SessionStatus,
  TerminalTab,
} from "../types";

type Orientation = "horizontal" | "vertical";
const KANBAN_TAB_ID = "__kanban__";
const SESSION_LOG_LIMIT = 500_000;
const SESSION_LOG_FLUSH_MS = 100;
const sessionOutputUnlisteners = new Map<string, Promise<() => void>>();
const sessionExitUnlisteners = new Map<string, Promise<() => void>>();
const sessionLogDecoders = new Map<string, TextDecoder>();
const pendingSessionLogText = new Map<string, string>();
const pendingSessionLogFlushTimers = new Map<string, number>();

interface SessionStoreState {
  layouts: Record<string, ProjectLayout>;
  sessions: Record<string, Session>;
  activePaneIds: Record<string, string | null>;
  /** Terminal tabs per project: projectId → TerminalTab[] */
  terminalTabs: Record<string, TerminalTab[]>;
  /** Active tab per project: projectId → tabId */
  activeTabIds: Record<string, string>;
  installedAgents: InstalledAgentStatus[];
  runtimeInfo: RuntimeInfo;
  settings: AppSettings;
  paneAttention: Record<string, boolean>;
  projectAttention: Record<string, number>;
  initializedProjects: Record<string, boolean>;
  sessionLogs: Record<string, string>;
  paneZooms: Record<string, number>;
  initialized: boolean;
  error: string | null;
  initialize: (
    projects: Project[],
    hydrateWorkspace: (openProjectIds: string[], activeProjectId: string | null) => void,
  ) => Promise<void>;
  ensureLayout: (projectId: string) => void;
  addTerminalTab: (projectId: string) => void;
  closeTerminalTab: (projectId: string, tabId: string) => void;
  setActiveTerminalTab: (projectId: string, tabId: string) => void;
  launchAgent: (project: Project, agent: AgentConfig, paneId?: string | null) => Promise<void>;
  launchShell: (project: Project, paneId?: string | null) => Promise<void>;
  splitPane: (projectId: string, orientation: Orientation) => void;
  setPaneFractions: (
    projectId: string,
    orientation: Orientation,
    fractions: number[],
  ) => void;
  focusPane: (projectId: string, paneId: string) => void;
  resizeSession: (sessionId: string, cols: number, rows: number) => Promise<void>;
  writeToSession: (sessionId: string, data: Uint8Array) => Promise<void>;
  markSessionStatus: (sessionId: string, status: SessionStatus) => void;
  killSession: (projectId: string, sessionId: string) => Promise<void>;
  upsertSettings: (patch: Partial<AppSettings>) => void;
  persistSnapshot: (openProjectIds: string[], activeProjectId: string | null) => Promise<void>;
  noteSessionActivity: (sessionId: string) => void;
  clearProjectAttention: (projectId: string) => void;
  clearError: () => void;
  syncProjects: (projects: Project[]) => void;
  maybeAutoSpawnDefaults: (project: Project, agents: AgentConfig[]) => Promise<void>;
  restartSession: (sessionId: string) => Promise<void>;
  killSessionsForProject: (projectId: string) => Promise<void>;
  appendSessionOutput: (sessionId: string, chunk: Uint8Array) => void;
  searchLogs: (query: string) => LogSearchResult[];
  exportSessionLog: (sessionId: string) => Promise<string | null>;
  adjustPaneZoom: (paneId: string, delta: number) => void;
}

/** Create a fresh TerminalTab for a project, with the projectId used as ID for the first one. */
function makeTab(projectId: string, index: number, id?: string): TerminalTab {
  return {
    id: id ?? nanoid(),
    projectId,
    label: `Terminal ${index + 1}`,
    createdAt: Date.now(),
  };
}

function getProjectTabs(
  state: Pick<SessionStoreState, "terminalTabs">,
  projectId: string,
): TerminalTab[] {
  const tabs = state.terminalTabs[projectId];
  if (tabs?.length) {
    return tabs;
  }

  // Recover gracefully from legacy / partially-migrated state where the UI
  // may still have a default terminal layout but the tab metadata is missing.
  return [makeTab(projectId, 0, projectId)];
}

/** Return the layout key (tabId) for the currently-active tab of a project. */
function getActiveTabKey(state: Pick<SessionStoreState, "terminalTabs" | "activeTabIds">, projectId: string): string {
  const tabs = getProjectTabs(state, projectId);
  const activeId = state.activeTabIds[projectId];
  if (activeId && tabs.some((tab) => tab.id === activeId)) {
    return activeId;
  }
  // Fall back: first tab ID or projectId itself (legacy / first load)
  return tabs[0]?.id ?? projectId;
}

function parseArgs(input: string | undefined) {
  if (!input?.trim()) {
    return [];
  }

  return input
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseRemoteProjectPath(path: string) {
  const match = path.match(/^([^@:\s]+@[^:\s]+):(.+)$/);
  if (!match) {
    return null;
  }

  return {
    host: match[1],
    remotePath: match[2],
  };
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function getBrowserOsLabel() {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("win")) {
    return "windows";
  }
  if (platform.includes("mac")) {
    return "macos";
  }
  if (platform.includes("linux") || platform.includes("x11")) {
    return "linux";
  }
  return navigator.platform || "desktop";
}

function getRuntimeShellFallback(shellOverride: string) {
  const value = shellOverride.trim();
  if (value) {
    return value.split(/[\\/]/).pop() || value;
  }
  return "auto";
}

async function invokeSafely<T>(command: string, args?: Record<string, unknown>) {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

async function ensureSessionEventBridge(sessionId: string) {
  if (!sessionOutputUnlisteners.has(sessionId)) {
    sessionOutputUnlisteners.set(
      sessionId,
      listen<number[]>(`pty-output:${sessionId}`, (event) => {
        const payload = new Uint8Array(event.payload);
        const store = useSessionStore.getState();
        store.appendSessionOutput(sessionId, payload);
        store.markSessionStatus(sessionId, "running");
        store.noteSessionActivity(sessionId);
      }),
    );
  }

  if (!sessionExitUnlisteners.has(sessionId)) {
    sessionExitUnlisteners.set(
      sessionId,
      listen(`pty-exit:${sessionId}`, () => {
        useSessionStore.getState().markSessionStatus(sessionId, "exited");
        void releaseSessionEventBridge(sessionId);
      }),
    );
  }

  await Promise.all([
    sessionOutputUnlisteners.get(sessionId),
    sessionExitUnlisteners.get(sessionId),
  ]);
}

async function releaseSessionEventBridge(sessionId: string) {
  const outputUnlisten = sessionOutputUnlisteners.get(sessionId);
  const exitUnlisten = sessionExitUnlisteners.get(sessionId);

  sessionOutputUnlisteners.delete(sessionId);
  sessionExitUnlisteners.delete(sessionId);
  sessionLogDecoders.delete(sessionId);
  const pendingFlush = pendingSessionLogFlushTimers.get(sessionId);
  if (pendingFlush !== undefined) {
    window.clearTimeout(pendingFlush);
    pendingSessionLogFlushTimers.delete(sessionId);
  }
  pendingSessionLogText.delete(sessionId);

  const [disposeOutput, disposeExit] = await Promise.all([
    outputUnlisten ?? Promise.resolve<() => void>(() => undefined),
    exitUnlisten ?? Promise.resolve<() => void>(() => undefined),
  ]);

  disposeOutput();
  disposeExit();
}

function flushPendingSessionOutput(sessionId: string) {
  const pending = pendingSessionLogText.get(sessionId);
  const flushTimer = pendingSessionLogFlushTimers.get(sessionId);
  if (flushTimer !== undefined) {
    window.clearTimeout(flushTimer);
    pendingSessionLogFlushTimers.delete(sessionId);
  }

  if (!pending) {
    pendingSessionLogText.delete(sessionId);
    return;
  }

  pendingSessionLogText.delete(sessionId);
  useSessionStore.setState((state) => {
    const current = state.sessionLogs[sessionId] ?? "";
    const next = `${current}${pending}`.slice(-SESSION_LOG_LIMIT);
    return {
      sessionLogs: {
        ...state.sessionLogs,
        [sessionId]: next,
      },
    };
  });
}

function queueSessionOutput(sessionId: string, text: string) {
  if (!text) {
    return;
  }

  pendingSessionLogText.set(sessionId, `${pendingSessionLogText.get(sessionId) ?? ""}${text}`);
  if (pendingSessionLogFlushTimers.has(sessionId)) {
    return;
  }

  const timer = window.setTimeout(() => {
    flushPendingSessionOutput(sessionId);
  }, SESSION_LOG_FLUSH_MS);
  pendingSessionLogFlushTimers.set(sessionId, timer);
}

function flushAllPendingSessionOutput() {
  for (const sessionId of Array.from(pendingSessionLogText.keys())) {
    flushPendingSessionOutput(sessionId);
  }
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  layouts: {},
  sessions: {},
  activePaneIds: {},
  terminalTabs: {},
  activeTabIds: {},
  installedAgents: [],
  runtimeInfo: {
    shell: "auto",
    os: getBrowserOsLabel(),
  },
  settings: DEFAULT_SETTINGS,
  paneAttention: {},
  projectAttention: {},
  initializedProjects: {},
  sessionLogs: {},
  paneZooms: {},
  initialized: false,
  error: null,
  initialize: async (projects, hydrateWorkspace) => {
    if (get().initialized) {
      return;
    }

    const persisted = await loadSessions();
    const persistedSettings = persisted?.settings ?? DEFAULT_SETTINGS;
    const migratedMcpServers =
      persistedSettings.mcpServers.length > 0
        ? persistedSettings.mcpServers
        : migrateLegacyProjectMcpServers(projects);
    const settings = {
      ...persistedSettings,
      mcpServers: migratedMcpServers,
    };
    const candidatePairs = KNOWN_AGENTS.map((agent) => [agent.id, agent.command] as [string, string]);

    let installedAgents: InstalledAgentStatus[] = [];
    let runtimeInfo: RuntimeInfo = {
      shell: getRuntimeShellFallback(settings.shellOverride),
      os: getBrowserOsLabel(),
    };

    try {
      installedAgents = await invokeSafely<InstalledAgentStatus[]>("detect_installed_agents", {
        candidates: candidatePairs,
      });
    } catch {
      installedAgents = candidatePairs.map(([id, command]) => ({
        id,
        command,
        installed: true,
      }));
    }

    try {
      runtimeInfo = await invokeSafely<RuntimeInfo>("runtime_info", {
        shellOverride: settings.shellOverride,
      });
    } catch {
      runtimeInfo = {
        shell: getRuntimeShellFallback(settings.shellOverride),
        os: getBrowserOsLabel(),
      };
    }

    const layouts = persisted?.layouts ?? {};
    const sessions = (persisted?.sessions ?? []).reduce<Record<string, Session>>((acc, session) => {
      if (projects.some((project) => project.id === session.projectId)) {
        acc[session.id] = session;
      }
      return acc;
    }, {});

    const activePaneIds = Object.values(layouts).reduce<Record<string, string | null>>(
      (acc, layout) => {
        acc[layout.projectId] = layout.panes.find((pane) => pane.sessionId)?.id ?? layout.panes[0]?.id ?? null;
        return acc;
      },
      {},
    );

    // Build terminal tab state — backwards compat: each project gets one tab using projectId as tabId
    const terminalTabs: Record<string, TerminalTab[]> = persisted?.terminalTabs ?? {};
    const activeTabIds: Record<string, string> = persisted?.activeTabIds ?? {};
    for (const project of projects) {
      if (!terminalTabs[project.id]) {
        // First load or legacy data: create one default tab using projectId as its ID
        terminalTabs[project.id] = [{ id: project.id, projectId: project.id, label: "Terminal 1", createdAt: Date.now() }];
        activeTabIds[project.id] = KANBAN_TAB_ID;
        // The layout keyed by projectId is already compatible — no rename needed
      } else if (!activeTabIds[project.id]) {
        activeTabIds[project.id] = KANBAN_TAB_ID;
      }
    }

    set({
      layouts,
      sessions,
      activePaneIds,
      terminalTabs,
      activeTabIds,
      installedAgents,
      runtimeInfo,
      settings,
      paneAttention: {},
      projectAttention: {},
      initializedProjects: persisted
        ? Object.fromEntries(projects.map((project) => [project.id, true]))
        : {},
      sessionLogs: {},
      paneZooms: {},
      initialized: true,
    });

    if (persisted) {
      hydrateWorkspace(persisted.openProjects, persisted.activeProjectId);
    }

    for (const project of projects) {
      get().ensureLayout(project.id);
    }

    if (persisted?.settings.restoreSessions) {
      for (const session of Object.values(sessions)) {
        if (session.status === "running" || session.status === "starting") {
          try {
            await ensureSessionEventBridge(session.id);
            await invokeSafely<string>("spawn_pty", {
              sessionId: session.id,
              command: session.command,
              args: session.args,
              cwd: session.cwd,
              env: session.env ?? {},
              cols: 120,
              rows: 32,
              shellOverride: settings.shellOverride,
            });

            get().markSessionStatus(session.id, "running");
          } catch {
            await releaseSessionEventBridge(session.id);
            get().markSessionStatus(session.id, "exited");
          }
        }
      }
    }
  },
  ensureLayout: (projectId) =>
    set((state) => {
      const tabKey = getActiveTabKey(state, projectId);
      if (state.layouts[tabKey]) {
        return state;
      }

      const newLayout = createDefaultLayout(tabKey);
      return {
        layouts: {
          ...state.layouts,
          [tabKey]: newLayout,
        },
        activePaneIds: {
          ...state.activePaneIds,
          [tabKey]: state.activePaneIds[tabKey] ?? newLayout.panes[0]?.id ?? null,
        },
      };
    }),

  addTerminalTab: (projectId) =>
    set((state) => {
      const existing = getProjectTabs(state, projectId);
      const newTab = makeTab(projectId, existing.length);
      const newLayout = createDefaultLayout(newTab.id);
      return {
        terminalTabs: { ...state.terminalTabs, [projectId]: [...existing, newTab] },
        activeTabIds: { ...state.activeTabIds, [projectId]: newTab.id },
        layouts: { ...state.layouts, [newTab.id]: newLayout },
        activePaneIds: { ...state.activePaneIds, [newTab.id]: newLayout.panes[0]?.id ?? null },
      };
    }),

  closeTerminalTab: (projectId, tabId) =>
    set((state) => {
      const existing = getProjectTabs(state, projectId);
      if (existing.length <= 1) return state; // can't close the last tab
      const remaining = existing.filter((tab) => tab.id !== tabId);
      const nextActiveId =
        state.activeTabIds[projectId] === tabId
          ? (remaining[remaining.length - 1]?.id ?? remaining[0]?.id)
          : state.activeTabIds[projectId];
      // Kill orphaned sessions in this tab's layout
      const tabLayout = state.layouts[tabId];
      const nextSessions = { ...state.sessions };
      if (tabLayout) {
        for (const pane of tabLayout.panes) {
          if (pane.sessionId) delete nextSessions[pane.sessionId];
        }
      }
      const nextLayouts = { ...state.layouts };
      delete nextLayouts[tabId];
      const nextActivePanes = { ...state.activePaneIds };
      delete nextActivePanes[tabId];
      return {
        terminalTabs: { ...state.terminalTabs, [projectId]: remaining },
        activeTabIds: { ...state.activeTabIds, [projectId]: nextActiveId ?? remaining[0]?.id ?? "" },
        layouts: nextLayouts,
        activePaneIds: nextActivePanes,
        sessions: nextSessions,
      };
    }),

  setActiveTerminalTab: (projectId, tabId) =>
    set((state) => {
      // Ensure the tab's layout exists
      if (!state.layouts[tabId]) {
        const newLayout = createDefaultLayout(tabId);
        return {
          activeTabIds: { ...state.activeTabIds, [projectId]: tabId },
          layouts: { ...state.layouts, [tabId]: newLayout },
          activePaneIds: { ...state.activePaneIds, [tabId]: newLayout.panes[0]?.id ?? null },
        };
      }
      return { activeTabIds: { ...state.activeTabIds, [projectId]: tabId } };
    }),

  launchAgent: async (project, agent, preferredPaneId) => {
    get().ensureLayout(project.id);

    const tabKey = getActiveTabKey(get(), project.id);
    let chosenPaneId = preferredPaneId ?? null;
    let chosenLayout = get().layouts[tabKey] ?? createDefaultLayout(tabKey);

    if (!chosenPaneId) {
      const emptyPane = chosenLayout.panes.find((pane) => pane.sessionId === null);
      chosenPaneId = emptyPane?.id ?? null;
    }

    if (!chosenPaneId) {
      if (chosenLayout.cols < 2) {
        get().splitPane(project.id, "vertical");
      } else if (chosenLayout.rows < 2) {
        get().splitPane(project.id, "horizontal");
      }
      chosenLayout = get().layouts[tabKey];
      chosenPaneId = chosenLayout.panes.find((pane) => pane.sessionId === null)?.id ?? null;
    }

    if (!chosenPaneId) {
      set({ error: "All panes are occupied. Split or close a session first." });
      return;
    }

    const sessionId = nanoid();
    const projectLaunch = await buildProjectAgentLaunchOverrides(
      project,
      agent.id,
      get().settings.mcpServers,
    );
    const defaultArgs = parseArgs(get().settings.defaultAgentArgs[agent.id]);
    const args = [...projectLaunch.args, ...defaultArgs, ...(agent.args ?? [])];
    const env = { ...(agent.env ?? {}), ...projectLaunch.env };

    const session: Session = {
      id: sessionId,
      projectId: project.id,
      agentId: agent.id,
      ptyId: sessionId,
      status: "starting",
      title: `${agent.name} — ${project.name}`,
      cwd: agent.cwdOverride?.trim() || project.path,
      command: agent.command,
      args,
      env,
      paneId: chosenPaneId,
    };

    set((state) => ({
        sessions: {
          ...state.sessions,
          [sessionId]: session,
        },
        sessionLogs: {
          ...state.sessionLogs,
          [sessionId]: state.sessionLogs[sessionId] ?? "",
        },
        layouts: {
          ...state.layouts,
          [tabKey]: {
            ...state.layouts[tabKey],
            panes: state.layouts[tabKey].panes.map((pane) =>
              pane.id === chosenPaneId ? { ...pane, sessionId } : pane,
            ),
          },
        },
        activePaneIds: {
          ...state.activePaneIds,
          [tabKey]: chosenPaneId,
        },
        error: null,
      }));

    try {
      const remote = parseRemoteProjectPath(project.path);
      const spawnCommand = remote ? "ssh" : agent.command;
      const spawnArgs = remote
        ? [
            remote.host,
            "-t",
            `cd ${shellEscape(agent.cwdOverride?.trim() || remote.remotePath)} && ${[agent.command, ...args]
              .map(shellEscape)
              .join(" ")}`,
          ]
        : args;

      await ensureSessionEventBridge(sessionId);
      await invokeSafely<string>("spawn_pty", {
        sessionId,
        command: spawnCommand,
        args: spawnArgs,
        cwd: remote ? "" : agent.cwdOverride?.trim() || project.path,
        env,
        cols: 120,
        rows: 32,
        shellOverride: get().settings.shellOverride,
      });

      get().markSessionStatus(sessionId, "running");
    } catch (error) {
      await releaseSessionEventBridge(sessionId);
      get().markSessionStatus(sessionId, "exited");
      set({
        error:
          error instanceof Error
            ? error.message
            : `Failed to start ${agent.name}.`,
      });
    }
  },
  launchShell: async (project, preferredPaneId) => {
    get().ensureLayout(project.id);

    const tabKey = getActiveTabKey(get(), project.id);
    let chosenPaneId = preferredPaneId ?? null;
    let chosenLayout = get().layouts[tabKey] ?? createDefaultLayout(tabKey);

    if (!chosenPaneId) {
      const emptyPane = chosenLayout.panes.find((pane) => pane.sessionId === null);
      chosenPaneId = emptyPane?.id ?? null;
    }

    if (!chosenPaneId) {
      if (chosenLayout.cols < 2) {
        get().splitPane(project.id, "vertical");
      } else if (chosenLayout.rows < 2) {
        get().splitPane(project.id, "horizontal");
      }
      chosenLayout = get().layouts[tabKey];
      chosenPaneId = chosenLayout.panes.find((pane) => pane.sessionId === null)?.id ?? null;
    }

    if (!chosenPaneId) {
      set({ error: "All panes are occupied. Split or close a session first." });
      return;
    }

    const sessionId = nanoid();
    const session: Session = {
      id: sessionId,
      projectId: project.id,
      agentId: "shell",
      ptyId: sessionId,
      status: "starting",
      title: `Shell — ${project.name}`,
      cwd: project.path,
      command: "",
      args: [],
      env: {},
      paneId: chosenPaneId,
    };

    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: session,
      },
      sessionLogs: {
        ...state.sessionLogs,
        [sessionId]: state.sessionLogs[sessionId] ?? "",
      },
      layouts: {
        ...state.layouts,
        [tabKey]: {
          ...state.layouts[tabKey],
          panes: state.layouts[tabKey].panes.map((pane) =>
            pane.id === chosenPaneId ? { ...pane, sessionId } : pane,
          ),
        },
      },
      activePaneIds: {
        ...state.activePaneIds,
        [tabKey]: chosenPaneId,
      },
      error: null,
    }));

    try {
      const remote = parseRemoteProjectPath(project.path);
      await ensureSessionEventBridge(sessionId);
      await invokeSafely<string>("spawn_pty", {
        sessionId,
        command: remote ? "ssh" : "",
        args: remote
          ? [remote.host, "-t", `cd ${shellEscape(remote.remotePath)} && $SHELL`]
          : [],
        cwd: remote ? "" : project.path,
        env: {},
        cols: 120,
        rows: 32,
        shellOverride: get().settings.shellOverride,
      });

      get().markSessionStatus(sessionId, "running");
    } catch (error) {
      await releaseSessionEventBridge(sessionId);
      get().markSessionStatus(sessionId, "exited");
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to start shell.",
      });
    }
  },
  splitPane: (projectId, orientation) =>
    set((state) => {
      const MAX_SPLITS = 2;
      const tabKey = getActiveTabKey(state, projectId);
      const current = state.layouts[tabKey] ?? createDefaultLayout(tabKey);

      if (orientation === "vertical") {
        if (current.cols >= MAX_SPLITS) {
          const keptPanes = current.panes.filter((pane) => pane.col === 0);
          const removedPanes = current.panes.filter((pane) => pane.col > 0);
          const nextSessions = { ...state.sessions };
          for (const pane of removedPanes) {
            if (pane.sessionId) delete nextSessions[pane.sessionId];
          }
          return {
            sessions: nextSessions,
            layouts: { ...state.layouts, [tabKey]: { ...current, cols: 1, panes: keptPanes, colFractions: [1] } },
          };
        }
        const panes = [...current.panes];
        for (let row = 0; row < current.rows; row += 1) panes.push(createPane(row, current.cols));
        return {
          layouts: {
            ...state.layouts,
            [tabKey]: {
              ...current,
              cols: current.cols + 1,
              panes,
              colFractions: normalizeFractions([...(current.colFractions ?? Array(current.cols).fill(1)), 1]),
            },
          },
        };
      }

      if (current.rows >= MAX_SPLITS) {
        const keptPanes = current.panes.filter((pane) => pane.row === 0);
        const removedPanes = current.panes.filter((pane) => pane.row > 0);
        const nextSessions = { ...state.sessions };
        for (const pane of removedPanes) {
          if (pane.sessionId) delete nextSessions[pane.sessionId];
        }
        return {
          sessions: nextSessions,
          layouts: { ...state.layouts, [tabKey]: { ...current, rows: 1, panes: keptPanes, rowFractions: [1] } },
        };
      }
      const panes = [...current.panes];
      for (let col = 0; col < current.cols; col += 1) panes.push(createPane(current.rows, col));
      return {
        layouts: {
          ...state.layouts,
          [tabKey]: {
            ...current,
            rows: current.rows + 1,
            panes,
            rowFractions: normalizeFractions([...(current.rowFractions ?? Array(current.rows).fill(1)), 1]),
          },
        },
      };
    }),

  setPaneFractions: (projectId, orientation, fractions) =>
    set((state) => {
      const tabKey = getActiveTabKey(state, projectId);
      const layout = state.layouts[tabKey];
      if (!layout) return state;
      return {
        layouts: {
          ...state.layouts,
          [tabKey]: {
            ...layout,
            rowFractions: orientation === "horizontal" ? normalizeFractions(fractions) : layout.rowFractions,
            colFractions: orientation === "vertical" ? normalizeFractions(fractions) : layout.colFractions,
          },
        },
      };
    }),
  focusPane: (projectId, paneId) =>
    set((state) => ({
      activePaneIds: { ...state.activePaneIds, [getActiveTabKey(state, projectId)]: paneId },
      paneAttention: {
        ...state.paneAttention,
        [paneId]: false,
      },
      projectAttention: {
        ...state.projectAttention,
        [projectId]: 0,
      },
    })),
  resizeSession: async (sessionId, cols, rows) => {
    await invokeSafely("resize_pty", {
      sessionId,
      cols,
      rows,
    });
  },
  writeToSession: async (sessionId, data) => {
    await invokeSafely("write_pty", {
      sessionId,
      data: Array.from(data),
    });
  },
  markSessionStatus: (sessionId, status) =>
    set((state) => ({
      sessions: state.sessions[sessionId]
        ? {
            ...state.sessions,
            [sessionId]: {
              ...state.sessions[sessionId],
              status,
            },
          }
        : state.sessions,
    })),
  killSession: async (projectId, sessionId) => {
    try {
      await invokeSafely("kill_pty", { sessionId });
    } catch {
      // Ignore backend kill failures and clean up frontend state anyway.
    }
    await releaseSessionEventBridge(sessionId);

    set((state) => {
      const nextSessions = { ...state.sessions };
      const closedSession = state.sessions[sessionId];
      delete nextSessions[sessionId];
      const nextLogs = { ...state.sessionLogs };
      delete nextLogs[sessionId];

      // Find which layout actually contains this session (could be any tab key,
      // not necessarily the projectId). Searching all layouts prevents the bug
      // where killing a session on Tab 1 (keyed by projectId) accidentally
      // cleared the pane on a different tab.
      const nextLayouts = { ...state.layouts };
      for (const [layoutKey, layout] of Object.entries(nextLayouts)) {
        if (layout.panes.some((pane) => pane.sessionId === sessionId)) {
          nextLayouts[layoutKey] = {
            ...layout,
            panes: layout.panes.map((pane) =>
              pane.sessionId === sessionId ? { ...pane, sessionId: null } : pane,
            ),
          };
          break;
        }
      }

      return {
        sessions: nextSessions,
        sessionLogs: nextLogs,
        layouts: nextLayouts,
        paneAttention: closedSession
          ? {
              ...state.paneAttention,
              [closedSession.paneId]: false,
            }
          : state.paneAttention,
      };
    });
  },
  killSessionsForProject: async (projectId) => {
    const sessionIds = Object.values(get().sessions)
      .filter((session) => session.projectId === projectId)
      .map((session) => session.id);

    for (const sessionId of sessionIds) {
      await get().killSession(projectId, sessionId);
    }
  },
  upsertSettings: (patch) =>
    set((state) => ({
      settings: {
        ...state.settings,
        ...patch,
        defaultAgentArgs: {
          ...state.settings.defaultAgentArgs,
          ...(patch.defaultAgentArgs ?? {}),
        },
      },
    })),
  persistSnapshot: async (openProjectIds, activeProjectId) => {
    const { layouts, sessions, settings, terminalTabs, activeTabIds } = get();
    await saveSessions({
      version: 1,
      openProjects: openProjectIds,
      activeProjectId,
      layouts,
      sessions: Object.values(sessions),
      settings,
      terminalTabs,
      activeTabIds,
    });
  },
  noteSessionActivity: (sessionId) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) {
        return state;
      }

      const activePaneId = state.activePaneIds[session.projectId];
      const shouldHighlight = activePaneId !== session.paneId;

      if (!shouldHighlight) {
        return state;
      }

      if (state.paneAttention[session.paneId]) {
        return state;
      }

      return {
        paneAttention: {
          ...state.paneAttention,
          [session.paneId]: true,
        },
        projectAttention: {
          ...state.projectAttention,
          [session.projectId]: (state.projectAttention[session.projectId] ?? 0) + 1,
        },
      };
    }),
  clearProjectAttention: (projectId) =>
    set((state) => ({ projectAttention: { ...state.projectAttention, [projectId]: 0 } })),
  clearError: () => set({ error: null }),
  syncProjects: (projects) =>
    set((state) => {
      const validProjectIds = new Set(projects.map((project) => project.id));
      const terminalTabs = { ...state.terminalTabs };
      const activeTabIds = { ...state.activeTabIds };

      for (const project of projects) {
        if (!terminalTabs[project.id]?.length) {
          terminalTabs[project.id] = [{ id: project.id, projectId: project.id, label: "Terminal 1", createdAt: Date.now() }];
        }

        if (!activeTabIds[project.id]) {
          activeTabIds[project.id] = KANBAN_TAB_ID;
        }
      }

      const validLayoutKeys = new Set(
        Object.entries(terminalTabs)
          .filter(([projectId]) => validProjectIds.has(projectId))
          .flatMap(([, tabs]) => tabs.map((tab) => tab.id)),
      );

      const layouts = Object.fromEntries(
        Object.entries(state.layouts)
          .filter(([layoutKey]) => validLayoutKeys.has(layoutKey))
          .map(([layoutKey, layout]) => [layoutKey, layout]),
      );

      const sessions = Object.fromEntries(
        Object.entries(state.sessions).filter(([, session]) =>
          validProjectIds.has(session.projectId),
        ),
      );
      const validSessionIds = new Set(Object.keys(sessions));

      const activePaneIds = Object.fromEntries(
        Object.entries(state.activePaneIds).filter(([layoutKey]) =>
          validLayoutKeys.has(layoutKey),
        ),
      );

      const paneAttention = Object.fromEntries(
        Object.entries(state.paneAttention).filter(([paneId]) =>
          Object.values(sessions).some((session) => session.paneId === paneId),
        ),
      );
      const sessionLogs = Object.fromEntries(
        Object.entries(state.sessionLogs).filter(([sessionId]) =>
          validSessionIds.has(sessionId),
        ),
      );
      const paneZooms = Object.fromEntries(
        Object.entries(state.paneZooms).filter(([paneId]) =>
          Object.values(sessions).some((session) => session.paneId === paneId),
        ),
      );

      const projectAttention = Object.fromEntries(
        Object.entries(state.projectAttention).filter(([projectId]) =>
          validProjectIds.has(projectId),
        ),
      );
      const initializedProjects = Object.fromEntries(
        Object.entries(state.initializedProjects).filter(([projectId]) =>
          validProjectIds.has(projectId),
        ),
      );

      return {
        layouts,
        sessions,
        activePaneIds,
        terminalTabs: Object.fromEntries(
          Object.entries(terminalTabs).filter(([projectId]) => validProjectIds.has(projectId)),
        ),
        activeTabIds: Object.fromEntries(
          Object.entries(activeTabIds).filter(([projectId]) => validProjectIds.has(projectId)),
        ),
        paneAttention,
        projectAttention,
        initializedProjects,
        sessionLogs,
        paneZooms,
      };
    }),
  maybeAutoSpawnDefaults: async (project, agents) => {
    if (get().initializedProjects[project.id]) {
      return;
    }

    const activeSessions = Object.values(get().sessions).filter(
      (session) => session.projectId === project.id,
    );

    set((state) => ({
      initializedProjects: {
        ...state.initializedProjects,
        [project.id]: true,
      },
    }));

    if (activeSessions.length > 0) {
      return;
    }

    for (const agentId of project.defaultAgents) {
      const agent = agents.find((entry) => entry.id === agentId);
      if (!agent) {
        continue;
      }
      await get().launchAgent(project, agent);
    }
  },
  restartSession: async (sessionId) => {
    const session = get().sessions[sessionId];
    if (!session) {
      return;
    }

    const projectLayout = get().layouts[session.projectId];
    const projectPane = projectLayout?.panes.find((pane) => pane.id === session.paneId);
    if (!projectPane) {
      return;
    }

    const project = {
      id: session.projectId,
      name: session.title.split(" — ")[1] ?? session.projectId,
      path: session.cwd,
      color: "#534AB7",
      defaultAgents: [],
      mcpServers: [],
      createdAt: Date.now(),
    } as Project;

    const agent: AgentConfig = {
      id: session.agentId,
      name: session.title.split(" — ")[0] ?? session.agentId,
      command: session.command,
      args: session.args,
      env: session.env,
      cwdOverride: session.cwd,
      color: "#534AB7",
      statusColor: "#534AB7",
    };

    await get().killSession(session.projectId, sessionId);
    await get().launchAgent(project, agent, session.paneId);
  },
  appendSessionOutput: (sessionId, chunk) =>
    {
      const decoder = sessionLogDecoders.get(sessionId) ?? new TextDecoder();
      sessionLogDecoders.set(sessionId, decoder);
      queueSessionOutput(sessionId, decoder.decode(chunk, { stream: true }));
    },
  searchLogs: (query) => {
    flushAllPendingSessionOutput();
    const value = query.trim().toLowerCase();
    if (!value) {
      return [];
    }

    return Object.values(get().sessions)
      .map((session) => {
        const log = get().sessionLogs[session.id] ?? "";
        const lines = log
          .split(/\r?\n/)
          .filter((line) => line.toLowerCase().includes(value))
          .slice(0, 5);
        return {
          sessionId: session.id,
          projectId: session.projectId,
          title: session.title,
          matches: lines,
        };
      })
      .filter((result) => result.matches.length > 0);
  },
  exportSessionLog: async (sessionId) => {
    flushPendingSessionOutput(sessionId);
    const session = get().sessions[sessionId];
    if (!session) {
      return null;
    }
    const contents = get().sessionLogs[sessionId] ?? "";
    const filename = `${session.title.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase()}-${Date.now()}.log`;
    await exportLogFile(filename, contents);
    return filename;
  },
  adjustPaneZoom: (paneId, delta) =>
    set((state) => ({
      paneZooms: {
        ...state.paneZooms,
        [paneId]: Math.min(8, Math.max(-4, (state.paneZooms[paneId] ?? 0) + delta)),
      },
    })),
}));
