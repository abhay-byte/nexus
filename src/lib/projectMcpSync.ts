import { dirname, homeDir } from "@tauri-apps/api/path";
import { create, exists, mkdir, readTextFile } from "@tauri-apps/plugin-fs";
import type { AgentId, McpServerConfig, Project } from "../types";

type JsonRecord = Record<string, unknown>;

type ManagedManifest = {
  version: 1;
  agents: Record<string, Record<string, string>>;
};

type AgentConfigAdapter = {
  relativePath: string;
  format: "mcpServers" | "opencode";
  parseMode?: "json" | "jsonc";
  launchEnv?: (projectPath: string) => Record<string, string>;
};

type LaunchOverrides = {
  args: string[];
  env: Record<string, string>;
};

type CodexHomeMcpServer = {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
};

const MANAGED_MANIFEST_RELATIVE_PATH = ".nexus/mcp-managed.json";
export const PROJECT_PATH_PLACEHOLDER = "<PROJECT_PATH>";

const AGENT_MCP_ADAPTERS: Partial<Record<AgentId, AgentConfigAdapter>> = {
  "claude-code": {
    relativePath: ".mcp.json",
    format: "mcpServers",
  },
  "gemini-cli": {
    relativePath: ".gemini/settings.json",
    format: "mcpServers",
  },
  opencode: {
    relativePath: ".nexus/opencode/opencode.json",
    format: "opencode",
    launchEnv: (projectPath) => ({
      OPENCODE_CONFIG: joinProjectPath(projectPath, ".nexus/opencode/opencode.json"),
    }),
  },
  "qwen-code": {
    relativePath: ".qwen/settings.json",
    format: "mcpServers",
  },
  "kilo-code": {
    relativePath: ".kilocode/mcp.json",
    format: "mcpServers",
  },
  junie: {
    relativePath: ".junie/mcp/mcp.json",
    format: "mcpServers",
  },
  kiro: {
    relativePath: ".kiro/settings/mcp.json",
    format: "mcpServers",
  },
  cline: {
    relativePath: ".nexus/cline/data/settings/cline_mcp_settings.json",
    format: "mcpServers",
    launchEnv: (projectPath) => ({
      CLINE_DIR: joinProjectPath(projectPath, ".nexus/cline"),
    }),
  },
};

const RUNTIME_ONLY_MCP_AGENT_IDS: AgentId[] = ["codex"];

export const MCP_AUTO_INSTALL_AGENT_IDS: AgentId[] = [
  ...Object.keys(AGENT_MCP_ADAPTERS),
  ...RUNTIME_ONLY_MCP_AGENT_IDS,
];

export function getAgentMcpInstallLabel(agentId: AgentId) {
  if (agentId === "codex") {
    return "Launch Args";
  }

  const adapter = AGENT_MCP_ADAPTERS[agentId];
  if (!adapter) {
    return "Manual";
  }

  return adapter.launchEnv ? "Launch Config" : "Project File";
}

function joinProjectPath(projectPath: string, relativePath: string) {
  return `${projectPath.replace(/[\\/]+$/, "")}/${relativePath}`;
}

function replaceAll(value: string, needle: string, replacement: string) {
  if (!needle) {
    return value;
  }
  return value.split(needle).join(replacement);
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mcp-server";
}

function codexKeyify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "mcp_server";
}

function stripJsonComments(value: string) {
  let result = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  let quote = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        result += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if ((char === "\"" || char === "'") && !inString) {
      inString = true;
      quote = char;
      result += char;
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    result += char;
  }

  return result.replace(/,\s*([}\]])/g, "$1");
}

function resolveProjectScopedValue(value: string, projectPath: string) {
  return replaceAll(value, PROJECT_PATH_PLACEHOLDER, projectPath);
}

function globalizeProjectScopedValue(value: string, projectPath: string) {
  return replaceAll(value, projectPath, PROJECT_PATH_PLACEHOLDER);
}

function resolveProjectScopedServer(server: McpServerConfig, project: Project): McpServerConfig {
  return {
    ...server,
    command: resolveProjectScopedValue(server.command, project.path),
    args: server.args.map((arg) => resolveProjectScopedValue(arg, project.path)),
    env: server.env
      ? Object.fromEntries(
          Object.entries(server.env).map(([key, value]) => [
            key,
            resolveProjectScopedValue(value, project.path),
          ]),
        )
      : {},
  };
}

function globalizeProjectScopedServer(server: McpServerConfig, projectPath: string): McpServerConfig {
  return {
    ...server,
    command: globalizeProjectScopedValue(server.command, projectPath),
    args: server.args.map((arg) => globalizeProjectScopedValue(arg, projectPath)),
    env: server.env
      ? Object.fromEntries(
          Object.entries(server.env).map(([key, value]) => [
            key,
            globalizeProjectScopedValue(value, projectPath),
          ]),
        )
      : {},
  };
}

function sortRecord(value?: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function migrateLegacyProjectMcpServers(projects: Project[]): McpServerConfig[] {
  const merged = new Map<string, McpServerConfig>();

  for (const project of projects) {
    for (const server of project.mcpServers ?? []) {
      const globalServer = globalizeProjectScopedServer(server, project.path);
      const key = JSON.stringify({
        name: globalServer.name,
        command: globalServer.command,
        args: globalServer.args,
        env: sortRecord(globalServer.env),
      });
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, {
          ...existing,
          enabledAgentIds: Array.from(
            new Set([...existing.enabledAgentIds, ...globalServer.enabledAgentIds]),
          ),
        });
        continue;
      }
      merged.set(key, {
        ...globalServer,
        env: sortRecord(globalServer.env),
      });
    }
  }

  return Array.from(merged.values());
}

function parseJsonLike<T>(content: string, mode: "json" | "jsonc") {
  const normalized = mode === "jsonc" ? stripJsonComments(content) : content;
  return JSON.parse(normalized) as T;
}

function buildMcpServersPayload(server: McpServerConfig) {
  const payload: JsonRecord = {
    command: server.command,
  };

  if (server.args.length > 0) {
    payload.args = server.args;
  }

  if (server.env && Object.keys(server.env).length > 0) {
    payload.env = server.env;
  }

  return payload;
}

function buildOpenCodePayload(server: McpServerConfig) {
  const payload: JsonRecord = {
    type: "local",
    command: [server.command, ...server.args],
    enabled: true,
  };

  if (server.env && Object.keys(server.env).length > 0) {
    payload.environment = server.env;
  }

  return payload;
}

function buildPayloadForAdapter(adapter: AgentConfigAdapter, server: McpServerConfig) {
  return adapter.format === "opencode"
    ? buildOpenCodePayload(server)
    : buildMcpServersPayload(server);
}

function readEntriesFromConfig(adapter: AgentConfigAdapter, root: JsonRecord) {
  if (adapter.format === "opencode") {
    return asRecord(root.mcp);
  }

  return asRecord(root.mcpServers);
}

function applyEntriesToConfig(
  adapter: AgentConfigAdapter,
  currentRoot: JsonRecord,
  entries: Record<string, unknown>,
) {
  if (adapter.format === "opencode") {
    return {
      ...currentRoot,
      $schema: currentRoot.$schema ?? "https://opencode.ai/config.json",
      mcp: entries,
    };
  }

  return {
    ...currentRoot,
    mcpServers: entries,
  };
}

async function ensureParentDirectory(path: string) {
  await mkdir(await dirname(path), { recursive: true });
}

async function readConfigRoot(path: string, mode: "json" | "jsonc" = "json") {
  const fileExists = await exists(path);
  if (!fileExists) {
    return null;
  }

  return asRecord(parseJsonLike<JsonRecord>(await readTextFile(path), mode));
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  const fileExists = await exists(path);
  if (!fileExists) {
    return null;
  }

  return JSON.parse(await readTextFile(path)) as T;
}

async function writeJsonFile(path: string, value: unknown) {
  await ensureParentDirectory(path);
  const file = await create(path);
  await file.write(new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
  await file.close();
}

function nextEntryKey(
  server: McpServerConfig,
  usedKeys: Set<string>,
  previousKey?: string,
) {
  if (previousKey && !usedKeys.has(previousKey)) {
    usedKeys.add(previousKey);
    return previousKey;
  }

  const base = slugify(server.name || server.id);
  let candidate = base;
  let index = 2;
  while (usedKeys.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  usedKeys.add(candidate);
  return candidate;
}

function nextCodexServerKey(server: McpServerConfig, usedKeys: Set<string>) {
  const base = codexKeyify(server.name || server.id);
  let candidate = `nexus_${base}`;
  let index = 2;
  while (usedKeys.has(candidate)) {
    candidate = `nexus_${base}_${index}`;
    index += 1;
  }
  usedKeys.add(candidate);
  return candidate;
}

function formatTomlString(value: string) {
  return JSON.stringify(value);
}

function formatTomlArray(values: string[]) {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function formatTomlKey(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : JSON.stringify(value);
}

function formatTomlInlineTable(values: Record<string, string>) {
  const entries = Object.entries(values).map(
    ([key, value]) => `${formatTomlKey(key)} = ${JSON.stringify(value)}`,
  );
  return `{ ${entries.join(", ")} }`;
}

function normalizeCommandSignature(command: string, args: string[]) {
  return `${command}\u0000${args.join("\u0000")}`;
}

function parseTomlStringLiteral(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"")) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return null;
}

function parseTomlStringArrayLiteral(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : null;
  } catch {
    return null;
  }
}

function parseCodexHomeMcpServers(content: string) {
  const servers = new Map<string, CodexHomeMcpServer>();
  let currentServer: CodexHomeMcpServer | null = null;
  let pendingArgsKey: string | null = null;
  let pendingArgsLines: string[] = [];

  const flushPendingArgs = () => {
    if (!currentServer || pendingArgsKey !== "args" || pendingArgsLines.length === 0) {
      pendingArgsKey = null;
      pendingArgsLines = [];
      return;
    }

    const parsedArgs = parseTomlStringArrayLiteral(pendingArgsLines.join(" "));
    if (parsedArgs) {
      currentServer.args = parsedArgs;
    }
    pendingArgsKey = null;
    pendingArgsLines = [];
  };

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    if (pendingArgsKey) {
      pendingArgsLines.push(line);
      if (line.includes("]")) {
        flushPendingArgs();
      }
      continue;
    }

    const sectionMatch = line.match(/^\[mcp_servers\.([^\]]+)\]$/);
    if (sectionMatch) {
      const rawName = sectionMatch[1];
      if (rawName.includes(".tools.")) {
        currentServer = null;
        continue;
      }

      const name =
        parseTomlStringLiteral(rawName) ??
        rawName.replace(/^"+|"+$/g, "");
      currentServer = servers.get(name) ?? { name };
      servers.set(name, currentServer);
      continue;
    }

    if (!currentServer) {
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!keyValueMatch) {
      continue;
    }

    const [, key, value] = keyValueMatch;
    if (key === "command" || key === "url") {
      const parsedValue = parseTomlStringLiteral(value);
      if (parsedValue) {
        currentServer[key] = parsedValue;
      }
      continue;
    }

    if (key === "args") {
      const parsedArgs = parseTomlStringArrayLiteral(value);
      if (parsedArgs) {
        currentServer.args = parsedArgs;
        continue;
      }

      pendingArgsKey = "args";
      pendingArgsLines = [value];
      if (value.includes("]")) {
        flushPendingArgs();
      }
    }
  }

  flushPendingArgs();
  return Array.from(servers.values());
}

async function readCodexHomeMcpServers() {
  try {
    const codexConfigPath = `${(await homeDir()).replace(/[\\/]+$/, "")}/.codex/config.toml`;
    const content = await readTextFile(codexConfigPath);
    return parseCodexHomeMcpServers(content);
  } catch {
    return [];
  }
}

async function getCodexDuplicateMatchers() {
  const homeServers = await readCodexHomeMcpServers();
  return {
    names: new Set(homeServers.map((server) => server.name.toLowerCase())),
    commandSignatures: new Set(
      homeServers
        .filter((server): server is CodexHomeMcpServer & { command: string } => Boolean(server.command))
        .map((server) => normalizeCommandSignature(server.command, server.args ?? [])),
    ),
  };
}

async function buildCodexLaunchArgs(project: Project, mcpServers: McpServerConfig[]) {
  const args: string[] = [];
  const usedKeys = new Set<string>();
  const duplicates = await getCodexDuplicateMatchers();

  for (const server of mcpServers.filter((entry) => entry.enabledAgentIds.includes("codex"))) {
    const resolvedServer = resolveProjectScopedServer(server, project);
    const normalizedName = resolvedServer.name.trim().toLowerCase();
    if (duplicates.names.has(normalizedName)) {
      continue;
    }

    const commandSignature = normalizeCommandSignature(
      resolvedServer.command,
      resolvedServer.args,
    );
    if (duplicates.commandSignatures.has(commandSignature)) {
      continue;
    }

    const key = nextCodexServerKey(resolvedServer, usedKeys);
    args.push("-c", `mcp_servers.${key}.command=${formatTomlString(resolvedServer.command)}`);

    if (resolvedServer.args.length > 0) {
      args.push("-c", `mcp_servers.${key}.args=${formatTomlArray(resolvedServer.args)}`);
    }

    if (resolvedServer.env && Object.keys(resolvedServer.env).length > 0) {
      args.push("-c", `mcp_servers.${key}.env=${formatTomlInlineTable(resolvedServer.env)}`);
    }
  }

  return args;
}

export async function buildProjectAgentLaunchOverrides(
  project: Project,
  agentId: AgentId,
  mcpServers: McpServerConfig[],
): Promise<LaunchOverrides> {
  if (agentId === "codex") {
    return {
      args: await buildCodexLaunchArgs(project, mcpServers),
      env: {},
    };
  }

  const adapter = AGENT_MCP_ADAPTERS[agentId];
  return {
    args: [],
    env: adapter?.launchEnv?.(project.path) ?? {},
  };
}

export async function syncProjectMcpFiles(project: Project, mcpServers: McpServerConfig[]) {
  const manifestPath = joinProjectPath(project.path, MANAGED_MANIFEST_RELATIVE_PATH);
  const manifest = (await readJsonFile<ManagedManifest>(manifestPath)) ?? {
    version: 1 as const,
    agents: {},
  };

  for (const [agentId, adapter] of Object.entries(AGENT_MCP_ADAPTERS) as Array<
    [AgentId, AgentConfigAdapter]
  >) {
    const configPath = joinProjectPath(project.path, adapter.relativePath);
    const currentRoot = (await readConfigRoot(configPath, adapter.parseMode ?? "json")) ?? {};
    const currentEntries = readEntriesFromConfig(adapter, currentRoot);
    const previousManagedKeys = manifest.agents[agentId] ?? {};
    const previousKeys = Object.values(previousManagedKeys);
    const usedKeys = new Set(
      Object.keys(currentEntries).filter((key) => !previousKeys.includes(key)),
    );

    const preservedEntries = Object.fromEntries(
      Object.entries(currentEntries).filter(([key]) => !previousKeys.includes(key)),
    );

    const enabledServers = mcpServers
      .filter((server) =>
      server.enabledAgentIds.includes(agentId),
      )
      .map((server) => resolveProjectScopedServer(server, project));

    const nextManagedKeys: Record<string, string> = {};
    const managedEntries = Object.fromEntries(
      enabledServers.map((server) => {
        const key = nextEntryKey(server, usedKeys, previousManagedKeys[server.id]);
        nextManagedKeys[server.id] = key;
        return [key, buildPayloadForAdapter(adapter, server)];
      }),
    );

    const nextEntries = {
      ...preservedEntries,
      ...managedEntries,
    };
    const nextConfig = applyEntriesToConfig(adapter, currentRoot, nextEntries);

    const hadConfigFile = await exists(configPath);
    const nextServerCount = Object.keys(nextEntries).length;
    if (hadConfigFile || nextServerCount > 0) {
      await writeJsonFile(configPath, nextConfig);
    }

    manifest.agents[agentId] = nextManagedKeys;
  }

  await writeJsonFile(manifestPath, manifest);
}
