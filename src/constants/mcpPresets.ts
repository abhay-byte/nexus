import { MCP_AUTO_INSTALL_AGENT_IDS } from "../lib/projectMcpSync";
import type { AgentId, McpServerConfig, Project } from "../types";

export interface McpServerPreset {
  id: string;
  name: string;
  description: string;
  command: string;
  args: (project: Project) => string[];
  env?: Record<string, string>;
  docsUrl: string;
  recommendedAgents: AgentId[];
  autoInstallAgents?: AgentId[];
  notes?: string[];
}

const GENERIC_MCP_AGENT_IDS: AgentId[] = [
  "codex",
  "claude-code",
  "gemini-cli",
  "opencode",
  "qwen-code",
  "kilo-code",
  "kiro",
  "junie",
  "cline",
];

export { MCP_AUTO_INSTALL_AGENT_IDS };

function autoInstallAgents(recommendedAgents: AgentId[]) {
  return recommendedAgents.filter((agentId) =>
    MCP_AUTO_INSTALL_AGENT_IDS.includes(agentId),
  );
}

export const MCP_SERVER_PRESETS: McpServerPreset[] = [
  {
    id: "context-mode",
    name: "context-mode",
    description: "Context window protection and indexed search tools for long coding sessions.",
    command: "context-mode",
    args: () => [],
    docsUrl: "https://github.com/mksglu/context-mode",
    recommendedAgents: ["codex", "claude-code", "gemini-cli", "kiro", "junie", "cline", "opencode"],
    autoInstallAgents: autoInstallAgents([
      "codex",
      "claude-code",
      "gemini-cli",
      "kiro",
      "junie",
      "cline",
      "opencode",
    ]),
    notes: [
      "Install first with `npm install -g context-mode`.",
      "Kiro also needs the upstream hook file and `KIRO.md` steering file for full routing enforcement.",
    ],
  },
  {
    id: "context7",
    name: "context7",
    description: "Up-to-date library and API documentation via Context7 MCP.",
    command: "npx",
    args: () => ["-y", "@upstash/context7-mcp"],
    env: {
      CONTEXT7_API_KEY: "",
    },
    docsUrl: "https://github.com/upstash/context7",
    recommendedAgents: GENERIC_MCP_AGENT_IDS,
    autoInstallAgents: autoInstallAgents(GENERIC_MCP_AGENT_IDS),
    notes: [
      "Optional but recommended: set `CONTEXT7_API_KEY` for higher rate limits.",
      "Upstream also documents a hosted MCP endpoint; Nexus presets use the command-based package because the current MCP model is stdio-only.",
    ],
  },
  {
    id: "playwright",
    name: "playwright",
    description: "Browser automation and UI debugging with Playwright MCP.",
    command: "npx",
    args: () => ["-y", "@playwright/mcp@latest"],
    docsUrl: "https://github.com/microsoft/playwright-mcp",
    recommendedAgents: GENERIC_MCP_AGENT_IDS,
    autoInstallAgents: autoInstallAgents(GENERIC_MCP_AGENT_IDS),
    notes: [
      "Playwright browsers may need to be installed separately depending on host setup.",
    ],
  },
  {
    id: "github",
    name: "github",
    description: "GitHub's official MCP server using the published container image.",
    command: "docker",
    args: () => [
      "run",
      "-i",
      "--rm",
      "-e",
      "GITHUB_PERSONAL_ACCESS_TOKEN",
      "ghcr.io/github/github-mcp-server",
    ],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: "",
    },
    docsUrl: "https://github.com/github/github-mcp-server",
    recommendedAgents: GENERIC_MCP_AGENT_IDS,
    autoInstallAgents: autoInstallAgents(GENERIC_MCP_AGENT_IDS),
    notes: [
      "Set `GITHUB_PERSONAL_ACCESS_TOKEN` before use.",
      "If you prefer not to use Docker, upstream also documents a built binary with `github-mcp-server stdio`.",
    ],
  },
  {
    id: "filesystem",
    name: "filesystem",
    description: "Official filesystem MCP server scoped to the selected project root.",
    command: "npx",
    args: (project) => ["-y", "@modelcontextprotocol/server-filesystem", project.path],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    recommendedAgents: GENERIC_MCP_AGENT_IDS,
    autoInstallAgents: autoInstallAgents(GENERIC_MCP_AGENT_IDS),
    notes: [
      "The preset automatically scopes access to the current project path.",
    ],
  },
  {
    id: "sequential-thinking",
    name: "sequential-thinking",
    description: "Official structured reasoning MCP server for reflective, stepwise problem solving.",
    command: "npx",
    args: () => ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    recommendedAgents: GENERIC_MCP_AGENT_IDS,
    autoInstallAgents: autoInstallAgents(GENERIC_MCP_AGENT_IDS),
  },
  {
    id: "android-mcp",
    name: "android-mcp",
    description: "Android device and emulator control over ADB.",
    command: "uvx",
    args: () => ["--python", "3.13", "android-mcp"],
    docsUrl: "https://github.com/CursorTouch/Android-MCP",
    recommendedAgents: GENERIC_MCP_AGENT_IDS,
    autoInstallAgents: autoInstallAgents(GENERIC_MCP_AGENT_IDS),
    notes: [
      "Requires ADB plus a connected emulator or device.",
      "Optional env keys include `ANDROID_MCP_CONNECTION` and `ANDROID_MCP_HOST` for Wi-Fi devices.",
    ],
  },
];

export function createMcpServerFromPreset(
  preset: McpServerPreset,
  project: Project,
): McpServerConfig {
  return {
    id: `mcp-${preset.id}-${project.id}`,
    name: preset.name,
    command: preset.command,
    args: preset.args(project),
    env: preset.env ? { ...preset.env } : {},
    enabledAgentIds: preset.recommendedAgents.filter((agentId) =>
      preset.autoInstallAgents?.includes(agentId) || project.defaultAgents.includes(agentId),
    ),
  };
}
