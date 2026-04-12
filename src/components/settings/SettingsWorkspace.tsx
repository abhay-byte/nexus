import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { KNOWN_AGENTS, PROJECT_SWATCHES } from "../../constants/agents";
import type {
  AppSettings,
  InstalledAgentStatus,
  McpServerConfig,
  Project,
  RuntimeInfo,
} from "../../types";

type SettingsSection = "appearance" | "terminal" | "session" | "projects" | "agents";

interface SettingsWorkspaceProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  activeProjectId: string | null;
  settings: AppSettings;
  installedAgents: InstalledAgentStatus[];
  runtimeInfo: RuntimeInfo;
  onOpenAddProject: () => void;
  onUpdateProject: (
    projectId: string,
    patch: Partial<Omit<Project, "id" | "createdAt">>,
  ) => Promise<void>;
  onRemoveProject: (projectId: string) => Promise<void>;
  onOpenProjectPath: (path: string) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onOpenAddCustomAgent: () => void;
}

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  eyebrow: string;
  accent: string;
}> = [
  { id: "appearance", label: "Appearance", eyebrow: "Display", accent: "#e63b2e" },
  { id: "terminal", label: "Terminal", eyebrow: "Shell", accent: "#0055ff" },
  { id: "session", label: "Session", eyebrow: "Behaviour", accent: "#1a1a1a" },
  { id: "projects", label: "Projects", eyebrow: "Workspace", accent: "#ffcc00" },
  { id: "agents", label: "Agents & MCP", eyebrow: "Runtime", accent: "#10B981" },
];

// ─── Shared small components ────────────────────────────────────────────────

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="block font-mono text-[10px] uppercase tracking-[0.3em] text-[#1a1a1a]/60 dark:text-[#f5f0e8]/60">
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono = false,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border-4 border-[#1a1a1a] bg-white px-4 py-3 text-[#1a1a1a] outline-none focus:border-[#0055ff] placeholder:text-[#1a1a1a]/35 dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8] dark:placeholder:text-[#f5f0e8]/35 ${mono ? "font-mono text-sm" : "font-body text-base font-semibold"}`}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full border-4 border-[#1a1a1a] bg-white px-4 py-3 font-mono text-base text-[#1a1a1a] outline-none focus:border-[#0055ff] dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8]"
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  minRows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      className="w-full resize-y border-4 border-[#1a1a1a] bg-white px-4 py-3 font-mono text-sm text-[#1a1a1a] outline-none focus:border-[#0055ff] placeholder:text-[#1a1a1a]/35 dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8] dark:placeholder:text-[#f5f0e8]/35"
    />
  );
}

function ToggleChip({
  active,
  label,
  meta,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  meta?: string;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-4 px-3 py-2 text-left ${active ? "border-[#1a1a1a] bg-[#1a1a1a] text-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#f5f0e8] dark:text-[#1a1a1a]" : "border-[#1a1a1a] bg-[#f5f0e8] text-[#1a1a1a] hover:bg-white dark:border-[#f5f0e8] dark:bg-[#2a2a2a] dark:text-[#f5f0e8] dark:hover:bg-[#1a1a1a]"}`}
    >
      <div className="flex items-center gap-2">
        {color ? <span className="h-3 w-3 border border-[#1a1a1a] dark:border-[#f5f0e8]" style={{ backgroundColor: color }} /> : null}
        <span className="font-headline text-sm font-black uppercase">{label}</span>
      </div>
      {meta ? <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] opacity-60">{meta}</p> : null}
    </button>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="border-4 border-[#1a1a1a] bg-white p-4 text-[#1a1a1a] dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8]">
      <span className="block h-2 w-10" style={{ backgroundColor: accent }} />
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">{label}</p>
      <p className="mt-1 font-headline text-3xl font-black uppercase leading-none">{value}</p>
    </div>
  );
}

function SectionHeading({ accent, label }: { accent: string; label: string }) {
  return (
    <div className="flex items-center gap-4 pb-5 border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8]">
      <span className="h-5 w-14 flex-shrink-0" style={{ backgroundColor: accent }} />
      <h2 className="font-headline text-4xl font-black uppercase leading-none">{label}</h2>
    </div>
  );
}

// ─── Helper parsers ──────────────────────────────────────────────────────────

function parseArgsInput(value: string) {
  return value.split(/\s+/).map((e) => e.trim()).filter(Boolean);
}

function formatArgs(args?: string[]) {
  return args?.join(" ") ?? "";
}

function parseEnvInput(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const [key, ...rest] = line.split("=");
      if (!key || rest.length === 0) return acc;
      acc[key.trim()] = rest.join("=").trim();
      return acc;
    }, {});
}

function formatEnv(env?: Record<string, string>) {
  if (!env) return "";
  return Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n");
}

function countConfiguredEnv(env?: Record<string, string>) {
  return Object.keys(env ?? {}).length;
}

// ─── Appearance Section ──────────────────────────────────────────────────────

function AppearanceSection({
  settings,
  onUpdateSettings,
}: {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}) {
  const fontFamilies = ["JetBrains Mono", "Fira Code", "Cascadia Code", "Hack", "Source Code Pro", "Monospace"];
  const themes: Array<{ value: AppSettings["theme"]; label: string }> = [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
  ];

  return (
    <div className="space-y-8">
      <SectionHeading accent="#e63b2e" label="Appearance" />

      {/* Theme */}
      <div className="space-y-3">
        <FieldLabel>Theme</FieldLabel>
        <div className="flex flex-wrap gap-3">
          {themes.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdateSettings({ theme: value })}
              className={`border-4 px-5 py-3 font-headline text-sm font-black uppercase ${settings.theme === value ? "border-[#1a1a1a] bg-[#1a1a1a] text-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#f5f0e8] dark:text-[#1a1a1a]" : "border-[#1a1a1a] bg-white text-[#1a1a1a] hover:bg-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#2a2a2a] dark:text-[#f5f0e8]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Font Family */}
      <div className="space-y-3">
        <FieldLabel>Font Family</FieldLabel>
        <div className="flex flex-wrap gap-3">
          {fontFamilies.map((font) => (
            <button
              key={font}
              type="button"
              onClick={() => onUpdateSettings({ fontFamily: font })}
              className={`border-4 px-4 py-2 font-mono text-sm ${settings.fontFamily === font ? "border-[#1a1a1a] bg-[#ffcc00] text-[#1a1a1a]" : "border-[#1a1a1a] bg-white text-[#1a1a1a] hover:bg-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8]"}`}
            >
              {font}
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <FieldLabel>Font Size</FieldLabel>
          <span className="font-mono font-black text-lg">{settings.fontSize}px</span>
        </div>
        <input
          type="range"
          min={8}
          max={24}
          value={settings.fontSize}
          onChange={(e) => onUpdateSettings({ fontSize: Number(e.target.value) })}
          className="w-full h-8 appearance-none border-4 border-[#1a1a1a] bg-[#f5f0e8] cursor-pointer accent-[#ffcc00] dark:border-[#f5f0e8] dark:bg-[#2a2a2a]"
        />
        <div className="flex justify-between font-mono text-[10px] opacity-50">
          <span>8px</span><span>24px</span>
        </div>
      </div>
    </div>
  );
}

// ─── Terminal Section ────────────────────────────────────────────────────────

function TerminalSection({
  settings,
  onUpdateSettings,
}: {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}) {
  const cursorStyles: Array<{ value: AppSettings["cursorStyle"]; label: string }> = [
    { value: "block", label: "Block" },
    { value: "bar", label: "Line" },
    { value: "underline", label: "Underline" },
  ];

  return (
    <div className="space-y-8">
      <SectionHeading accent="#0055ff" label="Terminal" />

      {/* Shell Override */}
      <div className="space-y-3">
        <FieldLabel>Shell Override</FieldLabel>
        <TextInput
          value={settings.shellOverride}
          onChange={(v) => onUpdateSettings({ shellOverride: v })}
          placeholder="/bin/bash  (leave blank for auto-detect)"
          mono
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#1a1a1a]/50 dark:text-[#f5f0e8]/50">
          Leave blank to use system default
        </p>
      </div>

      {/* Scrollback */}
      <div className="space-y-3">
        <FieldLabel>Scrollback Lines</FieldLabel>
        <NumberInput
          value={settings.scrollback}
          onChange={(v) => onUpdateSettings({ scrollback: v })}
          min={1000}
          max={100000}
        />
      </div>

      {/* Cursor Style */}
      <div className="space-y-3">
        <FieldLabel>Cursor Style</FieldLabel>
        <div className="flex flex-wrap gap-3">
          {cursorStyles.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdateSettings({ cursorStyle: value })}
              className={`border-4 px-5 py-3 font-headline text-sm font-black uppercase ${settings.cursorStyle === value ? "border-[#1a1a1a] bg-[#ffcc00] text-[#1a1a1a]" : "border-[#1a1a1a] bg-white text-[#1a1a1a] hover:bg-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Cursor Blink */}
      <div className="flex items-center justify-between border-4 border-[#1a1a1a] bg-[#f5f0e8] p-5 dark:border-[#f5f0e8] dark:bg-[#111111]">
        <div>
          <p className="font-headline font-black uppercase">Cursor Blink</p>
          <p className="mt-1 font-mono text-xs opacity-60">Animate the terminal cursor</p>
        </div>
        <button
          type="button"
          onClick={() => onUpdateSettings({ cursorBlink: !settings.cursorBlink })}
          className={`relative h-8 w-16 border-4 border-[#1a1a1a] transition-none dark:border-[#f5f0e8] ${settings.cursorBlink ? "bg-[#ffcc00]" : "bg-white dark:bg-[#1a1a1a]"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 border-2 border-[#1a1a1a] bg-[#1a1a1a] transition-none dark:border-[#f5f0e8] dark:bg-[#f5f0e8] ${settings.cursorBlink ? "right-0.5" : "left-0.5"}`}
          />
        </button>
      </div>
    </div>
  );
}

// ─── Session Section ─────────────────────────────────────────────────────────

function SessionSection({
  settings,
  onUpdateSettings,
}: {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <div className="space-y-8">
      <SectionHeading accent="#1a1a1a" label="Session" />

      {/* Restore Sessions Toggle */}
      <div className="flex items-center justify-between border-4 border-[#1a1a1a] bg-[#f5f0e8] p-5 dark:border-[#f5f0e8] dark:bg-[#111111]">
        <div>
          <p className="font-headline font-black uppercase">Restore on startup</p>
          <p className="mt-1 font-mono text-xs opacity-60">Automatically reload previous terminal sessions</p>
        </div>
        <button
          type="button"
          onClick={() => onUpdateSettings({ restoreSessions: !settings.restoreSessions })}
          className={`relative h-8 w-16 border-4 border-[#1a1a1a] transition-none dark:border-[#f5f0e8] ${settings.restoreSessions ? "bg-[#ffcc00]" : "bg-white dark:bg-[#1a1a1a]"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 border-2 border-[#1a1a1a] bg-[#1a1a1a] transition-none dark:border-[#f5f0e8] dark:bg-[#f5f0e8] ${settings.restoreSessions ? "right-0.5" : "left-0.5"}`}
          />
        </button>
      </div>

      {/* Info card */}
      <div className="border-4 border-[#1a1a1a] bg-white p-5 dark:border-[#f5f0e8] dark:bg-[#1a1a1a]">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Session Persistence</p>
        <p className="mt-3 font-headline text-lg font-black uppercase leading-tight">
          Sessions are stored locally and rehydrated on next launch if this is enabled.
        </p>
        <p className="mt-3 font-body text-sm leading-relaxed opacity-70">
          Each session stores its launch command, CWD, and agent configuration. The PTY output buffer is not persisted.
        </p>
      </div>
    </div>
  );
}

// ─── Projects Panel ──────────────────────────────────────────────────────────

function ProjectsPanel({
  projects,
  activeProjectId,
  settings,
  installedAgents,
  onOpenAddProject,
  onUpdateProject,
  onRemoveProject,
  onOpenProjectPath,
}: {
  projects: Project[];
  activeProjectId: string | null;
  settings: AppSettings;
  installedAgents: InstalledAgentStatus[];
  onOpenAddProject: () => void;
  onUpdateProject: (id: string, patch: Partial<Omit<Project, "id" | "createdAt">>) => Promise<void>;
  onRemoveProject: (id: string) => Promise<void>;
  onOpenProjectPath: (path: string) => void;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    activeProjectId ?? projects[0]?.id ?? null,
  );

  useEffect(() => {
    if (!projects.length) { setSelectedProjectId(null); return; }
    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) return;
    setSelectedProjectId(activeProjectId ?? projects[0]?.id ?? null);
  }, [activeProjectId, projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const allAgents = useMemo(() => [...KNOWN_AGENTS, ...settings.customAgents], [settings.customAgents]);
  const installedStatus = useMemo(
    () => new Map(installedAgents.map((e) => [e.id, e.installed])),
    [installedAgents],
  );

  const patchProject = (patch: Partial<Omit<Project, "id" | "createdAt">>) => {
    if (!selectedProject) return;
    void onUpdateProject(selectedProject.id, patch);
  };

  const updateServer = (serverId: string, patch: Partial<McpServerConfig>) => {
    if (!selectedProject) return;
    patchProject({
      mcpServers: selectedProject.mcpServers.map((s) =>
        s.id === serverId ? { ...s, ...patch } : s,
      ),
    });
  };

  const removeServer = (serverId: string) => {
    if (!selectedProject) return;
    patchProject({ mcpServers: selectedProject.mcpServers.filter((s) => s.id !== serverId) });
  };

  const addServer = () => {
    if (!selectedProject) return;
    patchProject({
      mcpServers: [
        ...selectedProject.mcpServers,
        {
          id: `mcp-${nanoid(6)}`,
          name: "NEW_SERVER",
          command: "",
          args: [],
          env: {},
          enabledAgentIds: selectedProject.defaultAgents,
        },
      ],
    });
  };

  return (
    <div className="space-y-8">
      <SectionHeading accent="#ffcc00" label="Projects" />

      {/* Registry header + list */}
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Left: project list */}
        <div className="flex flex-col gap-4">
          <div className="border-4 border-[#1a1a1a] bg-white p-5 dark:border-[#f5f0e8] dark:bg-[#1a1a1a]">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Workspace Registry</p>
            <p className="mt-2 font-headline text-4xl font-black uppercase leading-none">
              {String(projects.length).padStart(2, "0")}
            </p>
            <p className="mt-2 font-body text-sm leading-relaxed opacity-70">
              Each project owns its root path, startup agents, and MCP server map.
            </p>
            <button
              type="button"
              onClick={onOpenAddProject}
              className="mt-4 w-full border-4 border-[#1a1a1a] bg-[#0055ff] px-4 py-3 font-headline text-base font-black uppercase text-white hover:bg-[#1a1a1a] dark:border-[#f5f0e8]"
            >
              Register Project
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {projects.map((project) => {
              const active = project.id === selectedProjectId;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`border-4 px-4 py-4 text-left ${active ? "border-[#1a1a1a] bg-[#ffcc00] text-[#1a1a1a] shadow-[4px_4px_0px_0px_#1a1a1a] dark:border-[#f5f0e8] dark:shadow-[4px_4px_0px_0px_#f5f0e8]" : "border-[#1a1a1a] bg-white text-[#1a1a1a] hover:bg-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8] dark:hover:bg-[#2a2a2a]"}`}
                >
                  <span className="mb-2 block h-2 w-10 border border-[#1a1a1a] dark:border-[#f5f0e8]" style={{ backgroundColor: project.color }} />
                  <p className="font-headline text-xl font-black uppercase leading-none">{project.name}</p>
                  <p className="mt-1 line-clamp-1 font-mono text-[10px] opacity-60">{project.path}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: project detail */}
        <div>
          {selectedProject ? (
            <div className="space-y-6 border-4 border-[#1a1a1a] bg-white p-6 dark:border-[#f5f0e8] dark:bg-[#1a1a1a]">
              {/* Header */}
              <div className="flex flex-col gap-4 border-b-4 border-[#1a1a1a] pb-5 dark:border-[#f5f0e8] sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Project Profile</p>
                  <h3 className="mt-2 font-headline text-4xl font-black uppercase leading-none">
                    {selectedProject.name}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenProjectPath(selectedProject.path)}
                    className="border-4 border-[#1a1a1a] bg-[#f5f0e8] px-4 py-2 font-headline text-sm font-black uppercase hover:bg-[#ffcc00] dark:border-[#f5f0e8] dark:bg-[#2a2a2a] dark:text-[#f5f0e8]"
                  >
                    Open Folder
                  </button>
                  <button
                    type="button"
                    onClick={() => void onRemoveProject(selectedProject.id)}
                    className="border-4 border-[#1a1a1a] bg-[#e63b2e] px-4 py-2 font-headline text-sm font-black uppercase text-white hover:bg-[#1a1a1a] dark:border-[#f5f0e8]"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="Default Agents" value={`${selectedProject.defaultAgents.length}`} accent="#ffcc00" />
                <StatTile label="MCP Servers" value={`${selectedProject.mcpServers.length}`} accent="#0055ff" />
                <StatTile label="Active" value={selectedProject.id === activeProjectId ? "YES" : "NO"} accent={selectedProject.color} />
              </div>

              {/* Fields */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel>Project Name</FieldLabel>
                  <TextInput
                    value={selectedProject.name}
                    onChange={(v) => patchProject({ name: v })}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Root Path</FieldLabel>
                  <TextInput
                    value={selectedProject.path}
                    onChange={(v) => patchProject({ path: v })}
                    mono
                  />
                </div>
              </div>

              {/* Accent color */}
              <div className="space-y-3">
                <FieldLabel>Accent Color</FieldLabel>
                <div className="flex flex-wrap gap-3">
                  {PROJECT_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => patchProject({ color: swatch })}
                      className={`h-10 w-10 border-4 ${selectedProject.color === swatch ? "border-[#1a1a1a] shadow-[4px_4px_0px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_0px_#f5f0e8]" : "border-transparent hover:border-[#1a1a1a]"}`}
                      style={{ backgroundColor: swatch }}
                      title={swatch}
                    />
                  ))}
                </div>
              </div>

              {/* Default Agents */}
              <div className="space-y-3 border-t-4 border-[#1a1a1a] pt-5 dark:border-[#f5f0e8]">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Default Agents</p>
                    <p className="mt-1 font-headline text-2xl font-black uppercase leading-none">Startup Routing</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {allAgents.map((agent) => {
                    const isDefault = selectedProject.defaultAgents.includes(agent.id);
                    const installed = settings.customAgents.some((e) => e.id === agent.id)
                      ? true
                      : installedStatus.get(agent.id) ?? false;
                    return (
                      <ToggleChip
                        key={agent.id}
                        active={isDefault}
                        label={agent.name}
                        meta={installed ? "Installed" : "Unavailable"}
                        color={agent.color}
                        onClick={() => {
                          const nextDefaultAgents = isDefault
                            ? selectedProject.defaultAgents.filter((e) => e !== agent.id)
                            : [...selectedProject.defaultAgents, agent.id];
                          patchProject({ defaultAgents: nextDefaultAgents });
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* MCP Servers */}
              <div className="space-y-5 border-t-4 border-[#1a1a1a] pt-5 dark:border-[#f5f0e8]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">MCP Server Registry</p>
                    <p className="mt-1 font-headline text-2xl font-black uppercase leading-none">Context Bridge</p>
                  </div>
                  <button
                    type="button"
                    onClick={addServer}
                    className="border-4 border-[#1a1a1a] bg-[#ffcc00] px-4 py-2 font-headline text-sm font-black uppercase hover:bg-[#1a1a1a] hover:text-[#f5f0e8] dark:border-[#f5f0e8]"
                  >
                    Add MCP Server
                  </button>
                </div>

                {selectedProject.mcpServers.length ? (
                  <div className="space-y-5">
                    {selectedProject.mcpServers.map((server, index) => (
                      <article key={server.id} className="border-4 border-[#1a1a1a] bg-[#f5f0e8] p-5 dark:border-[#f5f0e8] dark:bg-[#111111]">
                        <div className="flex items-start justify-between gap-4 border-b-4 border-[#1a1a1a] pb-4 dark:border-[#f5f0e8]">
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">
                              Server {String(index + 1).padStart(2, "0")}
                            </p>
                            <h4 className="mt-1 font-headline text-2xl font-black uppercase leading-none">
                              {server.name || "Unnamed Server"}
                            </h4>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeServer(server.id)}
                            className="border-4 border-[#1a1a1a] bg-white px-3 py-2 font-headline text-sm font-black uppercase hover:bg-[#e63b2e] hover:text-white dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8]"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <FieldLabel>Server Name</FieldLabel>
                              <TextInput value={server.name} onChange={(v) => updateServer(server.id, { name: v })} />
                            </div>
                            <div className="space-y-2">
                              <FieldLabel>Command</FieldLabel>
                              <TextInput value={server.command} onChange={(v) => updateServer(server.id, { command: v })} mono />
                            </div>
                            <div className="space-y-2">
                              <FieldLabel>Arguments</FieldLabel>
                              <TextInput
                                value={formatArgs(server.args)}
                                onChange={(v) => updateServer(server.id, { args: parseArgsInput(v) })}
                                mono
                              />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <FieldLabel>Environment Variables</FieldLabel>
                              <TextArea
                                value={formatEnv(server.env)}
                                onChange={(v) => updateServer(server.id, { env: parseEnvInput(v) })}
                                placeholder={"API_KEY=...\nDEBUG=true"}
                                minRows={4}
                              />
                            </div>
                            <div className="border-4 border-[#1a1a1a] bg-white p-4 dark:border-[#f5f0e8] dark:bg-[#1a1a1a]">
                              <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Summary</p>
                              <div className="mt-3 grid grid-cols-3 gap-3">
                                {[
                                  { label: "Args", value: server.args.length },
                                  { label: "Env", value: countConfiguredEnv(server.env) },
                                  { label: "Agents", value: server.enabledAgentIds.length },
                                ].map(({ label, value }) => (
                                  <div key={label}>
                                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] opacity-60">{label}</p>
                                    <p className="mt-1 font-headline text-2xl font-black leading-none">{value}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          <FieldLabel>Enabled Agents</FieldLabel>
                          <div className="flex flex-wrap gap-3">
                            {allAgents.map((agent) => {
                              const enabled = server.enabledAgentIds.includes(agent.id);
                              return (
                                <ToggleChip
                                  key={`${server.id}-${agent.id}`}
                                  active={enabled}
                                  label={agent.name}
                                  meta={agent.command}
                                  color={agent.color}
                                  onClick={() => {
                                    const enabledAgentIds = enabled
                                      ? server.enabledAgentIds.filter((e) => e !== agent.id)
                                      : [...server.enabledAgentIds, agent.id];
                                    updateServer(server.id, { enabledAgentIds });
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="border-4 border-dashed border-[#1a1a1a] bg-[#f5f0e8] p-8 text-center dark:border-[#f5f0e8] dark:bg-[#111111]">
                    <p className="font-headline text-2xl font-black uppercase">No MCP servers yet</p>
                    <p className="mx-auto mt-3 max-w-sm font-body text-sm leading-relaxed opacity-70">
                      Register a server and explicitly opt agents into it to keep runtimes isolated.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center border-4 border-dashed border-[#1a1a1a] bg-[#f5f0e8] p-10 text-center dark:border-[#f5f0e8] dark:bg-[#111111]">
              <p className="font-headline text-3xl font-black uppercase">No project registered</p>
              <p className="mt-3 max-w-xs font-body text-sm leading-relaxed opacity-70">
                Create a project to configure agents and MCP servers.
              </p>
              <button
                type="button"
                onClick={onOpenAddProject}
                className="mt-5 border-4 border-[#1a1a1a] bg-[#ffcc00] px-5 py-3 font-headline text-base font-black uppercase hover:bg-[#1a1a1a] hover:text-[#f5f0e8] dark:border-[#f5f0e8]"
              >
                Add Project
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Agents Panel ────────────────────────────────────────────────────────────

function AgentsPanel({
  settings,
  installedAgents,
  runtimeInfo,
  onUpdateSettings,
  onOpenAddCustomAgent,
}: {
  settings: AppSettings;
  installedAgents: InstalledAgentStatus[];
  runtimeInfo: RuntimeInfo;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onOpenAddCustomAgent: () => void;
}) {
  const agentCatalog = useMemo(() => [...KNOWN_AGENTS, ...settings.customAgents], [settings.customAgents]);
  const installedStatus = useMemo(
    () => new Map(installedAgents.map((e) => [e.id, e.installed])),
    [installedAgents],
  );
  const removeCustomAgent = (agentId: string) => {
    onUpdateSettings({ customAgents: settings.customAgents.filter((a) => a.id !== agentId) });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeading accent="#10B981" label="Agents & MCP" />
        <button
          type="button"
          onClick={onOpenAddCustomAgent}
          className="shrink-0 border-4 border-[#1a1a1a] bg-[#0055ff] px-4 py-3 font-headline text-sm font-black uppercase text-white hover:bg-[#1a1a1a] dark:border-[#f5f0e8]"
        >
          Register Custom Agent
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Known Agents" value={`${KNOWN_AGENTS.length}`} accent="#ffcc00" />
        <StatTile label="Custom Agents" value={`${settings.customAgents.length}`} accent="#e63b2e" />
        <StatTile
          label="Detected"
          value={`${installedAgents.filter((e) => e.installed).length}`}
          accent="#0055ff"
        />
        <StatTile label="Shell" value={runtimeInfo.shell || "AUTO"} accent="#1a1a1a" />
      </div>

      {/* Runtime sidebar + agent list */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-5">
          {agentCatalog.map((agent) => {
            const isCustom = settings.customAgents.some((e) => e.id === agent.id);
            const installed = isCustom ? true : installedStatus.get(agent.id) ?? false;
            const defaultArgs = settings.defaultAgentArgs[agent.id] ?? formatArgs(agent.args);

            return (
              <article key={agent.id} className="border-4 border-[#1a1a1a] bg-[#f5f0e8] p-5 dark:border-[#f5f0e8] dark:bg-[#111111]">
                <div className="flex items-start justify-between gap-4 border-b-4 border-[#1a1a1a] pb-4 dark:border-[#f5f0e8]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="h-4 w-4 border border-[#1a1a1a] dark:border-[#f5f0e8]" style={{ backgroundColor: agent.color }} />
                      <h3 className="font-headline text-2xl font-black uppercase leading-none">{agent.name}</h3>
                      <span
                        className={`border-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${installed ? "border-[#1a1a1a] bg-[#1a1a1a] text-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#f5f0e8] dark:text-[#1a1a1a]" : "border-[#1a1a1a] bg-white text-[#1a1a1a] dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8]"}`}
                      >
                        {isCustom ? "Custom" : installed ? "Installed" : "Missing"}
                      </span>
                    </div>
                    <p className="mt-2 font-mono text-xs opacity-70">{agent.command}</p>
                  </div>
                  {isCustom ? (
                    <button
                      type="button"
                      onClick={() => removeCustomAgent(agent.id)}
                      className="border-4 border-[#1a1a1a] bg-white px-3 py-2 font-headline text-sm font-black uppercase hover:bg-[#e63b2e] hover:text-white dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8]"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <FieldLabel>Default Launch Args</FieldLabel>
                    <TextArea
                      value={defaultArgs}
                      onChange={(value) =>
                        onUpdateSettings({ defaultAgentArgs: { [agent.id]: value } })
                      }
                      placeholder="--flag value"
                      minRows={3}
                    />
                  </div>

                  <div className="border-4 border-[#1a1a1a] bg-white p-4 dark:border-[#f5f0e8] dark:bg-[#1a1a1a]">
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Execution Summary</p>
                    <dl className="mt-3 space-y-3">
                      <div>
                        <dt className="font-mono text-[10px] uppercase tracking-[0.25em] opacity-60">Command</dt>
                        <dd className="mt-0.5 break-all font-headline text-base font-black uppercase">{agent.command}</dd>
                      </div>
                      <div>
                        <dt className="font-mono text-[10px] uppercase tracking-[0.25em] opacity-60">Args Count</dt>
                        <dd className="mt-0.5 font-headline text-base font-black uppercase">
                          {parseArgsInput(defaultArgs).length}
                        </dd>
                      </div>
                      {agent.cwdOverride ? (
                        <div>
                          <dt className="font-mono text-[10px] uppercase tracking-[0.25em] opacity-60">CWD Override</dt>
                          <dd className="mt-0.5 break-all font-mono text-xs">{agent.cwdOverride}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Sidebar info */}
        <aside className="space-y-4">
          <div className="border-4 border-[#1a1a1a] bg-[#1a1a1a] p-5 text-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#f5f0e8] dark:text-[#1a1a1a]">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Runtime Info</p>
            <p className="mt-3 font-headline text-3xl font-black uppercase leading-none">{runtimeInfo.os}</p>
            <p className="mt-2 font-body text-sm leading-relaxed">
              Current shell: <span className="font-mono">{runtimeInfo.shell || "auto"}</span>
            </p>
          </div>

          <div className="border-4 border-[#1a1a1a] bg-[#f5f0e8] p-5 dark:border-[#f5f0e8] dark:bg-[#111111] dark:text-[#f5f0e8]">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">MCP Strategy</p>
            <p className="mt-3 font-headline text-base font-black uppercase leading-tight">
              Configure servers per project. Configure runtime defaults here.
            </p>
            <p className="mt-3 font-body text-sm leading-relaxed opacity-70">
              The Projects tab owns server definitions. This tab sets how agents launch and whether they are viable MCP hosts.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Root component ──────────────────────────────────────────────────────────

export function SettingsWorkspace({
  open,
  onClose,
  projects,
  activeProjectId,
  settings,
  installedAgents,
  runtimeInfo,
  onOpenAddProject,
  onUpdateProject,
  onRemoveProject,
  onOpenProjectPath,
  onUpdateSettings,
  onOpenAddCustomAgent,
}: SettingsWorkspaceProps) {
  const [section, setSection] = useState<SettingsSection>("appearance");

  useEffect(() => {
    if (!open) return;
    setSection("appearance");
  }, [open]);

  return (
    <div
      className={`fixed inset-0 z-[70] transition-all duration-300 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-[#1a1a1a]/55 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        className={`absolute inset-y-0 right-0 flex w-full justify-end transition-all duration-300 ${open ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}`}
      >
        <section
          className="flex h-full w-full max-w-[1200px] flex-col overflow-hidden border-l-8 border-[#1a1a1a] bg-[#e8e3da] text-[#1a1a1a] shadow-2xl dark:border-[#f5f0e8] dark:bg-[#0f0f0f] dark:text-[#f5f0e8] lg:flex-row"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          {/* ── Sidebar nav ── */}
          <aside className="flex flex-col border-b-4 border-[#1a1a1a] bg-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#111111] lg:w-[280px] lg:min-h-0 lg:border-b-0 lg:border-r-4">
            {/* Header */}
            <div className="border-b-4 border-[#1a1a1a] p-6 dark:border-[#f5f0e8]">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Nexus Terminal</p>
              <h1 id="settings-title" className="mt-3 font-headline text-5xl font-black uppercase leading-none">
                Settings
              </h1>
              <p className="mt-3 font-body text-sm leading-relaxed opacity-70">
                One control room for workspace configuration and agent runtime setup.
              </p>
            </div>

            {/* Nav buttons — horizontally scrollable on small screens, vertical on lg */}
            <nav className="flex overflow-x-auto lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:flex-1">
              {SETTINGS_SECTIONS.map((entry) => {
                const active = section === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSection(entry.id)}
                    className={`flex shrink-0 flex-col border-b-4 px-5 py-4 text-left lg:border-b-0 lg:border-b-4 ${active ? "border-[#1a1a1a] bg-[#ffcc00] text-[#1a1a1a] dark:border-[#f5f0e8] dark:bg-[#ffcc00] dark:text-[#1a1a1a]" : "border-[#1a1a1a] bg-transparent text-[#1a1a1a] hover:bg-[#f0ebe0] dark:border-[#f5f0e8] dark:text-[#f5f0e8] dark:hover:bg-[#1a1a1a]"}`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 flex-shrink-0 border border-[#1a1a1a] dark:border-[#f5f0e8]"
                        style={{ backgroundColor: active ? "#1a1a1a" : entry.accent }}
                      />
                      <span className="font-headline text-base font-black uppercase leading-none">{entry.label}</span>
                    </div>
                    <span className="ml-6 mt-1 font-mono text-[9px] uppercase tracking-[0.3em] opacity-50">{entry.eyebrow}</span>
                  </button>
                );
              })}
            </nav>

            {/* Close button */}
            <div className="border-t-4 border-[#1a1a1a] p-5 dark:border-[#f5f0e8] lg:mt-auto">
              <button
                type="button"
                onClick={onClose}
                className="w-full border-4 border-[#1a1a1a] bg-[#1a1a1a] px-4 py-4 font-headline text-lg font-black uppercase text-[#f5f0e8] hover:bg-[#ffcc00] hover:text-[#1a1a1a] dark:border-[#f5f0e8] dark:bg-[#f5f0e8] dark:text-[#1a1a1a]"
              >
                Close Settings
              </button>
            </div>
          </aside>

          {/* ── Main scrollable content ── */}
          <main className="min-h-0 flex-1 overflow-y-auto bg-[#e8e3da] dark:bg-[#0f0f0f]">
            <div className="mx-auto max-w-4xl p-6 lg:p-8">
              {section === "appearance" && (
                <AppearanceSection settings={settings} onUpdateSettings={onUpdateSettings} />
              )}
              {section === "terminal" && (
                <TerminalSection settings={settings} onUpdateSettings={onUpdateSettings} />
              )}
              {section === "session" && (
                <SessionSection settings={settings} onUpdateSettings={onUpdateSettings} />
              )}
              {section === "projects" && (
                <ProjectsPanel
                  projects={projects}
                  activeProjectId={activeProjectId}
                  settings={settings}
                  installedAgents={installedAgents}
                  onOpenAddProject={onOpenAddProject}
                  onUpdateProject={onUpdateProject}
                  onRemoveProject={onRemoveProject}
                  onOpenProjectPath={onOpenProjectPath}
                />
              )}
              {section === "agents" && (
                <AgentsPanel
                  settings={settings}
                  installedAgents={installedAgents}
                  runtimeInfo={runtimeInfo}
                  onUpdateSettings={onUpdateSettings}
                  onOpenAddCustomAgent={onOpenAddCustomAgent}
                />
              )}
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}
