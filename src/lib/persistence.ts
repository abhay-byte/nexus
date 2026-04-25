import {
  BaseDirectory,
  create,
  exists,
  mkdir,
  readTextFile,
} from "@tauri-apps/plugin-fs";
import { KNOWN_AGENTS } from "../constants/agents";
import { getDefaultKeybindings } from "../constants/keybindings";
import type {
  AgentId,
  AppSettings,
  PersistedProjects,
  PersistedSessions,
  Project,
  SpecKitProjectConfig,
} from "../types";

const DATA_DIR = "data";
const PROJECTS_FILE = `${DATA_DIR}/projects.json`;
const SESSIONS_FILE = `${DATA_DIR}/sessions.json`;
const validBuiltInAgentIds = new Set(KNOWN_AGENTS.map((agent) => agent.id));
const removedBuiltInAgentIds = new Set(["continue", "goose", "amp"]);

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  fontFamily: "JetBrains Mono",
  fontSize: 13,
  scrollback: 10000,
  cursorStyle: "block",
  cursorBlink: true,
  restoreSessions: true,
  shellOverride: "",
  defaultAgentArgs: {
    "claude-code": "--dangerously-skip-permissions",
  },
  customAgents: [],
  mcpServers: [],
  cavemanInstalledAgentIds: [],
  sidebarCollapsed: false,
  sidebarWidth: 256,
  keybindings: getDefaultKeybindings(),
};

function sanitizeMcpServers(settings: Pick<AppSettings, "mcpServers">) {
  return (settings.mcpServers ?? []).map((server) => ({
    ...server,
    enabledAgentIds: (server.enabledAgentIds ?? []).filter(
      (agentId) => !removedBuiltInAgentIds.has(agentId),
    ),
  }));
}

async function ensureDataDir() {
  const hasDir = await exists(DATA_DIR, { baseDir: BaseDirectory.AppConfig });
  if (!hasDir) {
    await mkdir(DATA_DIR, {
      baseDir: BaseDirectory.AppConfig,
      recursive: true,
    });
  }
}

function isRemoteProjectPath(path: string) {
  return /^[^@:\s]+@[^:\s]+:.+$/.test(path);
}

function sanitizeSpecKit(project: Project): SpecKitProjectConfig {
  const agentId = project.specKit?.agentId;
  return {
    enabled: project.specKit?.enabled ?? false,
    agentId: typeof agentId === "string" && !removedBuiltInAgentIds.has(agentId) ? agentId : null,
  };
}

function parsePersistedJson<T>(contents: string): T {
  try {
    return JSON.parse(contents) as T;
  } catch (initialError) {
    const trimmed = contents.trimEnd();
    for (let index = trimmed.length - 1; index > 0; index -= 1) {
      try {
        return JSON.parse(trimmed.slice(0, index)) as T;
      } catch {
        continue;
      }
    }
    throw initialError;
  }
}

function sanitizeProject(project: Project): Project {
  return {
    ...project,
    defaultAgents: (project.defaultAgents ?? []).filter(
      (agentId) => !removedBuiltInAgentIds.has(agentId),
    ),
    mcpServers: (project.mcpServers ?? []).map((server) => ({
      ...server,
      enabledAgentIds: (server.enabledAgentIds ?? []).filter(
        (agentId) => !removedBuiltInAgentIds.has(agentId),
      ),
    })),
    agencyAgent: {
      enabled: project.agencyAgent?.enabled ?? false,
      selectedAgentSlug: project.agencyAgent?.selectedAgentSlug ?? "agents-orchestrator",
    },
    specKit: sanitizeSpecKit(project),
  };
}

async function syncSpecKitState(project: Project): Promise<Project> {
  const sanitized = sanitizeProject(project);
  if (isRemoteProjectPath(sanitized.path)) {
    return sanitized;
  }

  try {
    const hasSpecifyDir = await exists(`${sanitized.path.replace(/[\\/]+$/, "")}/.specify`);
    if (!hasSpecifyDir) {
      return sanitized;
    }

    return {
      ...sanitized,
      specKit: {
        enabled: true,
        agentId: sanitized.specKit?.agentId ?? null,
      },
    };
  } catch {
    return sanitized;
  }
}

export async function loadProjects(): Promise<Project[]> {
  await ensureDataDir();

  const hasFile = await exists(PROJECTS_FILE, {
    baseDir: BaseDirectory.AppConfig,
  });

  if (!hasFile) {
    return [];
  }

  const contents = await readTextFile(PROJECTS_FILE, {
    baseDir: BaseDirectory.AppConfig,
  });

  const parsed = parsePersistedJson<PersistedProjects>(contents);
  return Promise.all((parsed.projects ?? []).map((project) =>
    syncSpecKitState({
      ...project,
      mcpServers: project.mcpServers ?? [],
    }),
  ));
}

export async function saveProjects(projects: Project[]) {
  await ensureDataDir();

  const file = await create(PROJECTS_FILE, {
    baseDir: BaseDirectory.AppConfig,
  });

  const payload: PersistedProjects = {
    version: 1,
    projects: projects.map(sanitizeProject),
  };

  try {
    await file.write(new TextEncoder().encode(JSON.stringify(payload, null, 2)));
  } catch (error) {
    console.error("Failed to write projects file:", error);
    throw error;
  } finally {
    await file.close();
  }
}

export async function loadSessions(): Promise<PersistedSessions | null> {
  await ensureDataDir();

  const hasFile = await exists(SESSIONS_FILE, {
    baseDir: BaseDirectory.AppConfig,
  });

  if (!hasFile) {
    return null;
  }

  const contents = await readTextFile(SESSIONS_FILE, {
    baseDir: BaseDirectory.AppConfig,
  });

  const parsed = parsePersistedJson<PersistedSessions>(contents);
  return {
    ...parsed,
    settings: {
      ...DEFAULT_SETTINGS,
      ...parsed.settings,
      defaultAgentArgs: {
        ...Object.fromEntries(
          Object.entries(DEFAULT_SETTINGS.defaultAgentArgs).filter(([agentId]) =>
            validBuiltInAgentIds.has(agentId),
          ),
        ),
        ...Object.fromEntries(
          Object.entries(parsed.settings?.defaultAgentArgs ?? {}).filter(([agentId]) =>
            !removedBuiltInAgentIds.has(agentId),
          ),
        ),
      },
      customAgents: parsed.settings?.customAgents ?? [],
      mcpServers: sanitizeMcpServers({
        mcpServers: parsed.settings?.mcpServers ?? DEFAULT_SETTINGS.mcpServers,
      }),
      cavemanInstalledAgentIds: (parsed.settings?.cavemanInstalledAgentIds ?? []).filter(
        (agentId): agentId is AgentId => typeof agentId === "string" && !removedBuiltInAgentIds.has(agentId),
      ),
      keybindings: {
        ...DEFAULT_SETTINGS.keybindings,
        ...parsed.settings?.keybindings,
      },
    },
  };
}

export async function saveSessions(payload: PersistedSessions) {
  await ensureDataDir();

  const file = await create(SESSIONS_FILE, {
    baseDir: BaseDirectory.AppConfig,
  });

  try {
    await file.write(new TextEncoder().encode(JSON.stringify(payload, null, 2)));
  } catch (error) {
    console.error("Failed to write sessions file:", error);
    throw error;
  } finally {
    await file.close();
  }
}

export async function exportLogFile(filename: string, contents: string) {
  await ensureDataDir();
  const exportDir = `${DATA_DIR}/exports`;
  const hasDir = await exists(exportDir, { baseDir: BaseDirectory.AppConfig });
  if (!hasDir) {
    await mkdir(exportDir, {
      baseDir: BaseDirectory.AppConfig,
      recursive: true,
    });
  }

  const file = await create(`${exportDir}/${filename}`, {
    baseDir: BaseDirectory.AppConfig,
  });
  await file.write(new TextEncoder().encode(contents));
  await file.close();
}
