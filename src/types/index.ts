export type AgentId =
  | "claude-code"
  | "codex"
  | "gemini-cli"
  | "aider"
  | "opencode"
  | string;

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
  defaultAgents: AgentId[];
  mcpServers: McpServerConfig[];
  agencyAgent?: AgencyAgentProjectConfig;
  specKit?: SpecKitProjectConfig;
  createdAt: number;
}

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
  defaultAgents: AgentId[];
  mcpServers: McpServerConfig[];
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
