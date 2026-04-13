import {
  BaseDirectory,
  create,
  exists,
  mkdir,
  readTextFile,
} from "@tauri-apps/plugin-fs";
import { KNOWN_AGENTS } from "../constants/agents";
import type {
  AppSettings,
  PersistedProjects,
  PersistedSessions,
  Project,
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
  };
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

  const parsed = JSON.parse(contents) as PersistedProjects;
  return (parsed.projects ?? []).map((project) =>
    sanitizeProject({
      ...project,
      mcpServers: project.mcpServers ?? [],
    }),
  );
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

  await file.write(new TextEncoder().encode(JSON.stringify(payload, null, 2)));
  await file.close();
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

  const parsed = JSON.parse(contents) as PersistedSessions;
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
    },
  };
}

export async function saveSessions(payload: PersistedSessions) {
  await ensureDataDir();

  const file = await create(SESSIONS_FILE, {
    baseDir: BaseDirectory.AppConfig,
  });

  await file.write(new TextEncoder().encode(JSON.stringify(payload, null, 2)));
  await file.close();
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
