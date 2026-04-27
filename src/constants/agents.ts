import type { AgentConfig } from "../types";

export const KNOWN_AGENTS: AgentConfig[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    command: "claude",
    args: ["--dangerously-skip-permissions"],
    color: "#F59E0B",
    statusColor: "#FBBF24",
  },
  {
    id: "codex",
    name: "Codex CLI",
    command: "codex",
    color: "#6EE7B7",
    statusColor: "#34D399",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    command: "gemini",
    color: "#60A5FA",
    statusColor: "#3B82F6",
  },
  {
    id: "aider",
    name: "Aider",
    command: "aider",
    color: "#FB7185",
    statusColor: "#F43F5E",
  },
  {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    color: "#C084FC",
    statusColor: "#A855F7",
  },
  {
    id: "qwen-code",
    name: "Qwen Code",
    command: "qwen",
    color: "#4DBBFF",
    statusColor: "#0EA5E9",
  },
  {
    id: "junie",
    name: "Junie",
    command: "junie",
    color: "#34D399",
    statusColor: "#10B981",
  },
  {
    id: "kiro",
    name: "Kiro",
    command: "kiro-cli",
    color: "#F472B6",
    statusColor: "#EC4899",
  },
  {
    id: "kilo-code",
    name: "Kilo Code",
    command: "kilo-code",
    color: "#FCD34D",
    statusColor: "#F59E0B",
  },
  {
    id: "cline",
    name: "Cline",
    command: "cline",
    color: "#A78BFA",
    statusColor: "#8B5CF6",
  },
];


export const PROJECT_SWATCHES = [
  "#534AB7",
  "#0EA5E9",
  "#10B981",
  "#F97316",
  "#EF4444",
  "#EAB308",
];

export const SPEC_KIT_SUPPORTED_AGENT_IDS = new Set(["codex", "claude-code", "gemini-cli"]);
export const CAVEMAN_ONE_CLICK_AGENT_IDS = new Set(["claude-code", "gemini-cli", "cline", "kiro"]);
export const DEFAULT_AGENCY_AGENT_SLUG = "agents-orchestrator";
