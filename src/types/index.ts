export type AgentId =
  | "claude-code"
  | "codex"
  | "gemini-cli"
  | "aider"
  | "opencode"
  | string;

export type ProjectCategory = "web" | "app" | "game" | "api" | "ml" | "tool" | "other";

export const PROJECT_CATEGORIES: { value: ProjectCategory; label: string }[] = [
  { value: "web", label: "Web" },
  { value: "app", label: "App" },
  { value: "game", label: "Game" },
  { value: "api", label: "API / Backend" },
  { value: "ml", label: "ML / AI" },
  { value: "tool", label: "CLI Tool" },
  { value: "other", label: "Other" },
];

export interface AgentConfig {
  id: AgentId;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwdOverride?: string;
  color: string;
  statusColor: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabledAgentIds: AgentId[];
  presetId?: string;
}

export interface AgencyAgentProjectConfig {
  enabled: boolean;
  selectedAgentSlug: string;
}

export interface SpecKitProjectConfig {
  enabled: boolean;
  agentId: AgentId | null;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  color: string;
  icon?: string; // Absolute path to a PNG image file
  category: ProjectCategory;
  defaultAgents: AgentId[];
  mcpServers: McpServerConfig[];
  agencyAgent?: AgencyAgentProjectConfig;
  specKit?: SpecKitProjectConfig;
  createdAt: number;
  sortOrder: number;
}

export type KeybindingMap = Record<string, string | null>;

export interface AppSettings {
  theme: "dark" | "light";
  fontFamily: string;
  fontSize: number;
  scrollback: number;
  cursorStyle: "block" | "bar" | "underline";
  cursorBlink: boolean;
  restoreSessions: boolean;
  shellOverride: string;
  defaultAgentArgs: Record<string, string>;
  customAgents: AgentConfig[];
  mcpServers: McpServerConfig[];
  cavemanInstalledAgentIds: AgentId[];
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  keybindings: KeybindingMap;
}

export interface PersistedProjects {
  version: 1;
  projects: Project[];
}

export interface Pane {
  id: string;
  sessionId: string | null;
  row: number;
  col: number;
}

export interface ProjectLayout {
  projectId: string;
  rows: number;
  cols: number;
  panes: Pane[];
  rowFractions?: number[];
  colFractions?: number[];
}

/** A named terminal page within a project. Each tab has its own split pane grid. */
export interface TerminalTab {
  id: string;          // also used as the layout key
  projectId: string;
  label: string;
  createdAt: number;
}

export type SessionStatus = "running" | "idle" | "exited" | "starting";

export interface Session {
  id: string;
  projectId: string;
  agentId: AgentId;
  ptyId: string;
  status: SessionStatus;
  title: string;
  cwd: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  paneId: string;
  restored?: boolean;
}

export interface LogSearchResult {
  sessionId: string;
  projectId: string;
  title: string;
  matches: string[];
}

export interface PersistedSessions {
  version: 1;
  openProjects: string[];
  activeProjectId: string | null;
  layouts: Record<string, ProjectLayout>;
  sessions: Session[];
  settings: AppSettings;
  /** Terminal tabs per project (optional — added in v1 tab update). */
  terminalTabs?: Record<string, TerminalTab[]>;
  /** Active tab ID per project. */
  activeTabIds?: Record<string, string>;
}

export interface AddProjectDraft {
  name: string;
  path: string;
  color: string;
  icon?: string;
  category: ProjectCategory;
  defaultAgents: AgentId[];
  mcpServers: McpServerConfig[];
  agencyAgent?: AgencyAgentProjectConfig;
  specKit?: SpecKitProjectConfig;
  cavemanAgentIds: AgentId[];
  mcpPresetIds: string[];
}

export interface InstalledAgentStatus {
  id: string;
  command: string;
  installed: boolean;
}

export interface RuntimeInfo {
  shell: string;
  os: string;
}

export interface SystemHealth {
  cpu: number;
  ram_used: number;
  ram_total: number;
}
export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_usage: number;
  memory_mb: number;
}

