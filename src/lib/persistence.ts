import { KNOWN_AGENTS } from "../constants/agents";
import { getDefaultKeybindings } from "../constants/keybindings";
import { isTauri, httpApi } from "./api";
import type {
  AgentId,
  AppSettings,
  PersistedProjects,
  PersistedSessions,
  Project,
  SpecKitProjectConfig,
} from "../types";

// Lazy-load Tauri fs plugin so browser mode doesn't crash on import
let fsModule: typeof import("@tauri-apps/plugin-fs") | null = null;
async function getFs() {
  if (!fsModule) {
    fsModule = await import("@tauri-apps/plugin-fs");
  }
  return fsModule;
}

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
  const fs = await getFs();
  const hasDir = await fs.exists(DATA_DIR, { baseDir: fs.BaseDirectory.AppConfig });
  if (!hasDir) {
    await fs.mkdir(DATA_DIR, {
      baseDir: fs.BaseDirectory.AppConfig,
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
    category: project.category ?? "other",
    sortOrder: project.sortOrder ?? project.createdAt ?? Date.now(),
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
    const fs = await getFs();
    const hasSpecifyDir = await fs.exists(`${sanitized.path.replace(/[\\/]+$/, "")}/.specify`);
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
  if (!isTauri()) {
    // Browser mode: fetch from HTTP API
    try {
      const projects = await httpApi.get<Project[]>("/api/projects");
      return projects.map((p) => sanitizeProject(p));
    } catch {
      return [];
    }
  }

  await ensureDataDir();
  const fs = await getFs();

  const hasFile = await fs.exists(PROJECTS_FILE, {
    baseDir: fs.BaseDirectory.AppConfig,
  });

  if (!hasFile) {
    return [];
  }

  const contents = await fs.readTextFile(PROJECTS_FILE, {
    baseDir: fs.BaseDirectory.AppConfig,
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
  if (!isTauri()) {
    // Browser mode: sync each project to HTTP API
    try {
      const existing = await httpApi.get<Array<{ id?: string }>>("/api/projects");
      const existingIds = new Set(existing.map((p) => p.id));
      for (const project of projects) {
        if (existingIds.has(project.id)) {
          await httpApi.put(`/api/projects/${project.id}`, project);
        } else {
          await httpApi.post("/api/projects", project);
        }
      }
    } catch (error) {
      console.error("Failed to sync projects to server:", error);
    }
    return;
  }

  await ensureDataDir();
  const fs = await getFs();

  const file = await fs.create(PROJECTS_FILE, {
    baseDir: fs.BaseDirectory.AppConfig,
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
  if (!isTauri()) return null;

  await ensureDataDir();
  const fs = await getFs();

  const hasFile = await fs.exists(SESSIONS_FILE, {
    baseDir: fs.BaseDirectory.AppConfig,
  });

  if (!hasFile) {
    return null;
  }

  const contents = await fs.readTextFile(SESSIONS_FILE, {
    baseDir: fs.BaseDirectory.AppConfig,
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
  if (!isTauri()) return;

  await ensureDataDir();
  const fs = await getFs();

  const file = await fs.create(SESSIONS_FILE, {
    baseDir: fs.BaseDirectory.AppConfig,
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
  if (!isTauri()) return;

  await ensureDataDir();
  const fs = await getFs();
  const exportDir = `${DATA_DIR}/exports`;
  const hasDir = await fs.exists(exportDir, { baseDir: fs.BaseDirectory.AppConfig });
  if (!hasDir) {
    await fs.mkdir(exportDir, {
      baseDir: fs.BaseDirectory.AppConfig,
      recursive: true,
    });
  }

  const file = await fs.create(`${exportDir}/${filename}`, {
    baseDir: fs.BaseDirectory.AppConfig,
  });
  await file.write(new TextEncoder().encode(contents));
  await file.close();
}
