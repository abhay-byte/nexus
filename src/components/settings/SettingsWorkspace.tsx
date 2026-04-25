import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { open } from "@tauri-apps/plugin-dialog";
import { KNOWN_AGENTS, PROJECT_SWATCHES } from "../../constants/agents";
import {
  MCP_AUTO_INSTALL_AGENT_IDS,
  MCP_SERVER_PRESETS,
  createMcpServerFromPreset,
  matchesMcpServerPreset,
} from "../../constants/mcpPresets";
import { getImageDataUrl } from "../../lib/imageDataUrl";
import { getAgentMcpInstallLabel } from "../../lib/projectMcpSync";
import type {
  AgentId,
  AppSettings,
  AgencyAgentProjectConfig,
  InstalledAgentStatus,
  McpServerConfig,
  Project,
  RuntimeInfo,
} from "../../types";

type SettingsSection = "appearance" | "terminal" | "session" | "projects" | "agents";

interface AgencyAgentOption {
  slug: string;
  name: string;
  category: string;
}

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
  onBootstrapSpecKit: (projectPath: string, agentId: string) => Promise<string>;
  onInstallCaveman: (agentId: string) => Promise<string>;
  onListAgencyAgents: () => Promise<AgencyAgentOption[]>;
  onSyncProjectAgencyAgent: (projectPath: string, slug: string, enabled: boolean) => Promise<string>;
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

const SPEC_KIT_SUPPORTED_AGENT_IDS = new Set(["codex", "claude-code", "gemini-cli"]);
const CAVEMAN_ONE_CLICK_AGENT_IDS = new Set(["claude-code", "gemini-cli", "cline", "kiro"]);
const DEFAULT_AGENCY_AGENT_SLUG = "agents-orchestrator";

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

function formatRuntimeShellLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "shell" || normalized === "auto") {
    return "auto";
  }
  if (normalized === "pwsh" || normalized === "pwsh.exe" || normalized === "powershell" || normalized === "powershell.exe") {
    return "PowerShell";
  }
  if (normalized === "cmd" || normalized === "cmd.exe") {
    return "CMD";
  }
  return value.split(/[\\/]/).pop() || value;
}

function formatRuntimeOsLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "desktop") {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes("win")) {
      return "windows";
    }
    if (platform.includes("mac")) {
      return "macOS";
    }
    if (platform.includes("linux") || platform.includes("x11")) {
      return "linux";
    }
    return navigator.platform || "desktop";
  }
  if (normalized === "macos") {
    return "macOS";
  }
  return value;
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

function AgencyDropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; count?: number; category?: string }>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder ?? "Select...";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full border-4 border-[#1a1a1a] bg-white px-4 py-3 font-mono text-sm text-[#1a1a1a] outline-none hover:bg-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8] dark:hover:bg-[#2a2a2a] flex items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2 truncate">
          {selected?.category ? (
            <span className="shrink-0 border-2 border-[#1a1a1a] bg-[#ffcc00] px-1.5 py-0.5 font-headline text-[9px] font-black uppercase tracking-wider text-[#1a1a1a] dark:border-[#f5f0e8]">
              {selected.category}
            </span>
          ) : null}
          <span className="truncate">{displayLabel}</span>
        </span>
        <span
          className="material-symbols-outlined shrink-0 text-base transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>

      {open ? (
        <div className="absolute top-full left-0 right-0 z-[200] mt-1 max-h-[260px] overflow-y-auto border-4 border-[#1a1a1a] bg-white shadow-[6px_6px_0px_0px_#1a1a1a] dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:shadow-[6px_6px_0px_0px_#f5f0e8]">
          {options.length === 0 ? (
            <div className="px-4 py-3 font-mono text-xs opacity-50">No options</div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { onChange(option.value); setOpen(false); }}
                  className={`w-full px-4 py-3 text-left font-mono text-sm flex items-center justify-between gap-2 border-b-2 border-[#1a1a1a]/10 dark:border-[#f5f0e8]/10 last:border-0 ${
                    isSelected
                      ? "bg-[#ffcc00] text-[#1a1a1a] dark:bg-[#ffcc00] dark:text-[#1a1a1a]"
                      : "text-[#1a1a1a] hover:bg-[#f5f0e8] dark:text-[#f5f0e8] dark:hover:bg-[#2a2a2a]"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {option.count !== undefined ? (
                    <span className="shrink-0 border-2 border-[#1a1a1a]/30 px-1.5 py-0.5 font-headline text-[9px] font-black uppercase dark:border-[#f5f0e8]/30">
                      {option.count}
                    </span>
                  ) : null}
                  {isSelected ? (
                    <span className="material-symbols-outlined shrink-0 text-sm text-[#1a1a1a]">check</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
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

function PresetCard({
  title,
  description,
  docsUrl,
  meta,
  active,
  onToggle,
}: {
  title: string;
  description: string;
  docsUrl: string;
  meta: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="border-4 border-[#1a1a1a] bg-white p-4 dark:border-[#f5f0e8] dark:bg-[#1a1a1a]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-headline text-lg font-black uppercase leading-none">{title}</p>
          <p className="mt-2 font-body text-sm leading-relaxed opacity-75">{description}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 border-4 border-[#1a1a1a] bg-[#ffcc00] px-3 py-2 font-headline text-xs font-black uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f5f0e8] dark:border-[#f5f0e8]"
        >
          {active ? "Remove" : "Add"}
        </button>
      </div>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] opacity-60">{meta}</p>
      <a
        className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.2em] text-[#0055ff] underline underline-offset-4 dark:text-[#ffcc00]"
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        Upstream Docs
      </a>
    </article>
  );
}

function ActionFeedback({
  title,
  message,
  tone = "neutral",
}: {
  title: string;
  message: string;
  tone?: "neutral" | "success" | "error";
}) {
  const accent =
    tone === "success" ? "#10B981" : tone === "error" ? "#e63b2e" : "#0055ff";

  return (
    <div className="border-4 border-[#1a1a1a] bg-white p-4 dark:border-[#f5f0e8] dark:bg-[#1a1a1a]">
      <span className="block h-2 w-10" style={{ backgroundColor: accent }} />
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">{title}</p>
      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed opacity-80">
        {message}
      </pre>
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
  runtimeInfo,
  onUpdateSettings,
}: {
  settings: AppSettings;
  runtimeInfo: RuntimeInfo;
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
          placeholder={runtimeInfo.os === "windows" ? "pwsh.exe  (leave blank for auto-detect)" : "/bin/bash  (leave blank for auto-detect)"}
          mono
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#1a1a1a]/50 dark:text-[#f5f0e8]/50">
          {runtimeInfo.os === "windows" ? "Leave blank to prefer PowerShell, then fall back to cmd.exe" : "Leave blank to use system default"}
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
  onBootstrapSpecKit,
  onListAgencyAgents,
  onSyncProjectAgencyAgent,
}: {
  projects: Project[];
  activeProjectId: string | null;
  settings: AppSettings;
  installedAgents: InstalledAgentStatus[];
  onOpenAddProject: () => void;
  onUpdateProject: (id: string, patch: Partial<Omit<Project, "id" | "createdAt">>) => Promise<void>;
  onRemoveProject: (id: string) => Promise<void>;
  onOpenProjectPath: (path: string) => void;
  onBootstrapSpecKit: (projectPath: string, agentId: string) => Promise<string>;
  onListAgencyAgents: () => Promise<AgencyAgentOption[]>;
  onSyncProjectAgencyAgent: (projectPath: string, slug: string, enabled: boolean) => Promise<string>;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    activeProjectId ?? projects[0]?.id ?? null,
  );
  const [specKitAgentId, setSpecKitAgentId] = useState<string>("codex");
  const [specKitStatus, setSpecKitStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [specKitRunning, setSpecKitRunning] = useState(false);
  const [agencyAgents, setAgencyAgents] = useState<AgencyAgentOption[]>([]);
  const [agencyLoading, setAgencyLoading] = useState(false);
  const [agencyFetched, setAgencyFetched] = useState(false);
  const [agencyStatus, setAgencyStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [agencyRunning, setAgencyRunning] = useState(false);
  const [agencyCategory, setAgencyCategory] = useState<string>("");
  const [draftAgencySlug, setDraftAgencySlug] = useState<string>(DEFAULT_AGENCY_AGENT_SLUG);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const agencyFetchRef = useRef(false);

  useEffect(() => {
    if (!projects.length) { setSelectedProjectId(null); return; }
    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) return;
    setSelectedProjectId(activeProjectId ?? projects[0]?.id ?? null);
  }, [activeProjectId, projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedAgencyConfig: AgencyAgentProjectConfig = selectedProject?.agencyAgent ?? {
    enabled: false,
    selectedAgentSlug: DEFAULT_AGENCY_AGENT_SLUG,
  };

  const allAgents = useMemo(() => [...KNOWN_AGENTS, ...settings.customAgents], [settings.customAgents]);
  const installedStatus = useMemo(
    () => new Map(installedAgents.map((e) => [e.id, e.installed])),
    [installedAgents],
  );
  const specKitAgents = useMemo(
    () => allAgents.filter((agent) => SPEC_KIT_SUPPORTED_AGENT_IDS.has(agent.id)),
    [allAgents],
  );
  const selectedProjectSpecKitEnabled = selectedProject?.specKit?.enabled ?? false;
  const selectedProjectSpecKitAgentId = selectedProject?.specKit?.agentId ?? null;

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    const preferred = selectedProject.defaultAgents.find((agentId) =>
      specKitAgents.some((agent) => agent.id === agentId),
    );
    setSpecKitAgentId((current) => {
      if (current && specKitAgents.some((agent) => agent.id === current)) {
        return current;
      }
      return preferred ?? specKitAgents[0]?.id ?? "codex";
    });
  }, [selectedProject, specKitAgents]);

  useEffect(() => {
    setDraftAgencySlug(selectedAgencyConfig.selectedAgentSlug);
  }, [selectedAgencyConfig.selectedAgentSlug, selectedProjectId]);

  useEffect(() => {
    if (!selectedProject?.icon) {
      setIconPreview(null);
      return;
    }
    let cancelled = false;
    void getImageDataUrl(selectedProject.icon).then((url) => {
      if (!cancelled) setIconPreview(url);
    }).catch(() => {
      if (!cancelled) setIconPreview(null);
    });
    return () => { cancelled = true; };
  }, [selectedProject?.icon]);

  const handlePickIcon = async () => {
    const file = await open({ multiple: false, filters: [{ name: "Image", extensions: ["png"] }] });
    if (!file || Array.isArray(file)) return;
    const dataUrl = await getImageDataUrl(file);
    setIconPreview(dataUrl);
    patchProject({ icon: file });
  };

  const handleClearIcon = () => {
    setIconPreview(null);
    patchProject({ icon: undefined });
  };

  useEffect(() => {
    if (!agencyAgents.length) {
      return;
    }

    const draftMatch = agencyAgents.find((agent) => agent.slug === draftAgencySlug);
    if (draftMatch) {
      if (agencyCategory !== draftMatch.category) {
        setAgencyCategory(draftMatch.category);
      }
      return;
    }

    if (!agencyCategory || !agencyAgents.some((agent) => agent.category === agencyCategory)) {
      setAgencyCategory(agencyAgents[0]?.category ?? "");
    }
  }, [agencyAgents, agencyCategory, draftAgencySlug]);

  // Agency agents are NOT loaded on mount — loading requires a git clone which hangs the UI.
  // User must click "Load Catalog" to trigger the fetch.
  const fetchAgencyAgents = () => {
    if (agencyFetchRef.current) return;
    agencyFetchRef.current = true;
    setAgencyLoading(true);
    setAgencyFetched(false);
    void onListAgencyAgents()
      .then((entries) => {
        setAgencyAgents(entries);
        setAgencyFetched(true);
      })
      .catch(() => {
        setAgencyAgents([]);
        setAgencyFetched(true);
      })
      .finally(() => {
        setAgencyLoading(false);
        agencyFetchRef.current = false;
      });
  };

  const patchProject = (patch: Partial<Omit<Project, "id" | "createdAt">>) => {
    if (!selectedProject) return;
    void onUpdateProject(selectedProject.id, patch);
  };

  const runSpecKitBootstrap = async () => {
    if (!selectedProject) {
      return;
    }

    setSpecKitRunning(true);
    setSpecKitStatus(null);
    try {
      const message = await onBootstrapSpecKit(selectedProject.path, specKitAgentId);
      patchProject({
        specKit: {
          enabled: true,
          agentId: specKitAgentId,
        },
      });
      setSpecKitStatus({ tone: "success", message });
    } catch (error) {
      setSpecKitStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSpecKitRunning(false);
    }
  };

  const patchAgencyConfig = (patch: Partial<AgencyAgentProjectConfig>) => {
    if (!selectedProject) {
      return;
    }

    patchProject({
      agencyAgent: {
        ...selectedAgencyConfig,
        ...patch,
      },
    });
  };

  const applyAgencySelection = async (enabled: boolean, slug: string) => {
    patchAgencyConfig({
      enabled,
      selectedAgentSlug: slug,
    });
    await syncAgencyAgent(enabled, slug);
  };

  const syncAgencyAgent = async (enabled: boolean, slug: string) => {
    if (!selectedProject) {
      return;
    }

    setAgencyRunning(true);
    setAgencyStatus(null);
    try {
      const message = await onSyncProjectAgencyAgent(selectedProject.path, slug, enabled);
      setAgencyStatus({ tone: "success", message });
    } catch (error) {
      setAgencyStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setAgencyRunning(false);
    }
  };

  return (
    <div className="space-y-8">
      <SectionHeading accent="#ffcc00" label="Projects" />

      {/* Registry header + list */}
      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Left: project list — sticky so it stays visible while scrolling the right column */}
        <div className="sticky top-0 flex flex-col gap-4 self-start mt-4">
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
                <StatTile label="Color" value={selectedProject.color.toUpperCase()} accent={selectedProject.color} />
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

              {/* Project Icon */}
              <div className="space-y-3">
                <FieldLabel>Project Icon</FieldLabel>
                <div className="flex items-center gap-4">
                  {iconPreview ? (
                    <img
                      src={iconPreview}
                      alt="Project icon"
                      className="h-16 w-16 border-4 border-[#1a1a1a] object-cover dark:border-[#f5f0e8]"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center border-4 border-[#1a1a1a] bg-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#2a2a2a]">
                      <span className="material-symbols-outlined text-2xl opacity-50">image</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void handlePickIcon()}
                      className="border-4 border-[#1a1a1a] bg-[#0055ff] px-4 py-2 font-headline text-sm font-black uppercase text-white hover:bg-[#1a1a1a] dark:border-[#f5f0e8]"
                    >
                      Pick Icon
                    </button>
                    {selectedProject.icon ? (
                      <button
                        type="button"
                        onClick={handleClearIcon}
                        className="border-4 border-[#1a1a1a] bg-[#f5f0e8] px-4 py-2 font-headline text-sm font-black uppercase hover:bg-[#e63b2e] hover:text-white dark:border-[#f5f0e8] dark:bg-[#2a2a2a] dark:text-[#f5f0e8]"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
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
                        meta={`${installed ? "Installed" : "Unavailable"} • ${getAgentMcpInstallLabel(agent.id)}`}
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

              <div className="space-y-4 border-t-4 border-[#1a1a1a] pt-5 dark:border-[#f5f0e8]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Workflow Bootstrap</p>
                    <p className="mt-1 font-headline text-2xl font-black uppercase leading-none">Spec Kit</p>
                    <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed opacity-70">
                      Initialize GitHub Spec Kit in this project for Codex, Claude Code, or Gemini CLI. Nexus runs the upstream <span className="font-mono">specify init --here --force --ai ...</span> bootstrap, so the real <span className="font-mono">.specify/</span> files are merged into the current project without the interactive non-empty-directory prompt.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runSpecKitBootstrap()}
                    disabled={specKitRunning || !specKitAgents.length}
                    className="border-4 border-[#1a1a1a] bg-[#0055ff] px-4 py-2 font-headline text-sm font-black uppercase text-white hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#f5f0e8]"
                  >
                    {specKitRunning
                      ? "Bootstrapping..."
                      : selectedProjectSpecKitEnabled
                        ? "Rebootstrap Spec Kit"
                        : "Bootstrap Spec Kit"}
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <FieldLabel>Target Agent</FieldLabel>
                    <div className="flex flex-wrap gap-3">
                      {specKitAgents.map((agent) => {
                        const installed = selectedProjectSpecKitEnabled && (
                          selectedProjectSpecKitAgentId === null ||
                          selectedProjectSpecKitAgentId === agent.id
                        );
                        return (
                          <ToggleChip
                            key={`spec-kit-${agent.id}`}
                            active={specKitAgentId === agent.id}
                            label={agent.name}
                            meta={installed ? "Bootstrapped in project" : "Ready to bootstrap"}
                            color={agent.color}
                            onClick={() => setSpecKitAgentId(agent.id)}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-4 border-[#1a1a1a] bg-[#f5f0e8] p-4 dark:border-[#f5f0e8] dark:bg-[#111111]">
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Result</p>
                    <p className="mt-2 font-body text-sm leading-relaxed opacity-80">
                      Adds agent-facing Spec Kit commands and the real <span className="font-mono">.specify/</span> workflow skeleton to this project.
                    </p>
                  </div>
                </div>

                {specKitStatus ? (
                  <ActionFeedback
                    title="Spec Kit Result"
                    message={specKitStatus.message}
                    tone={specKitStatus.tone}
                  />
                ) : null}
              </div>

              <div className="space-y-4 border-t-4 border-[#1a1a1a] pt-5 dark:border-[#f5f0e8]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Project Add-On</p>
                    <p className="mt-1 font-headline text-2xl font-black uppercase leading-none">Agency Agent</p>
                    <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed opacity-70">
                      Install one upstream specialist from <span className="font-mono">agency-agents</span> into this project as a Nexus-managed root file at <span className="font-mono">AGENCY.md</span>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void applyAgencySelection(selectedAgencyConfig.enabled, draftAgencySlug)}
                    disabled={agencyRunning || agencyLoading || !selectedAgencyConfig.enabled}
                    className="border-4 border-[#1a1a1a] bg-[#10B981] px-4 py-2 font-headline text-sm font-black uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f5f0e8] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#f5f0e8]"
                  >
                    {agencyRunning ? "Syncing..." : "Apply Agency File"}
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="border-4 border-[#1a1a1a] bg-[#f5f0e8] p-4 dark:border-[#f5f0e8] dark:bg-[#111111]">
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Toggle</p>
                    <button
                      type="button"
                      onClick={() => {
                        const nextEnabled = !selectedAgencyConfig.enabled;
                        void applyAgencySelection(nextEnabled, draftAgencySlug);
                      }}
                      className={`mt-3 relative h-8 w-16 border-4 border-[#1a1a1a] transition-none dark:border-[#f5f0e8] ${selectedAgencyConfig.enabled ? "bg-[#10B981]" : "bg-white dark:bg-[#1a1a1a]"}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 border-2 border-[#1a1a1a] bg-[#1a1a1a] transition-none dark:border-[#f5f0e8] dark:bg-[#f5f0e8] ${selectedAgencyConfig.enabled ? "right-0.5" : "left-0.5"}`}
                      />
                    </button>
                    <p className="mt-3 font-body text-sm leading-relaxed opacity-80">
                      {selectedAgencyConfig.enabled ? "Enabled for this project" : "Disabled for this project"}
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* Two-tier category + specialist dropdowns */}
                    {!agencyFetched && !agencyLoading ? (
                      <div className="border-4 border-dashed border-[#1a1a1a] bg-[#f5f0e8] p-5 text-center dark:border-[#f5f0e8] dark:bg-[#111111]">
                        <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60 mb-3">
                          Agency specialist catalog requires a network fetch
                        </p>
                        <button
                          type="button"
                          onClick={fetchAgencyAgents}
                          className="border-4 border-[#1a1a1a] bg-[#0055ff] px-4 py-2 font-headline text-sm font-black uppercase text-white hover:bg-[#1a1a1a] dark:border-[#f5f0e8]"
                        >
                          Load Catalog
                        </button>
                      </div>
                    ) : agencyLoading ? (
                      <div className="border-4 border-[#1a1a1a] bg-[#f5f0e8] p-5 dark:border-[#f5f0e8] dark:bg-[#111111]">
                        <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60 animate-pulse">
                          Fetching upstream agency catalog via git clone...
                        </p>
                        <p className="mt-2 font-body text-xs opacity-50">
                          This performs a shallow git clone of the agency-agents repository. May take a few seconds.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Category dropdown */}
                        <div className="space-y-2">
                          <FieldLabel>Agency Category</FieldLabel>
                          <AgencyDropdown
                            value={agencyCategory}
                            onChange={(cat) => {
                              setAgencyCategory(cat);
                              // Auto-select first specialist in new category
                              const firstInCat = agencyAgents.find((a) => a.category === cat);
                              if (firstInCat) {
                                setDraftAgencySlug(firstInCat.slug);
                              }
                            }}
                            options={Array.from(new Set(agencyAgents.map((a) => a.category))).map((cat) => ({
                              value: cat,
                              label: cat,
                              count: agencyAgents.filter((a) => a.category === cat).length,
                            }))}
                            placeholder="Select category..."
                          />
                        </div>
                        {/* Specialist dropdown */}
                        <div className="space-y-2">
                          <FieldLabel>Agency Specialist</FieldLabel>
                          <AgencyDropdown
                            value={draftAgencySlug}
                            onChange={(value) => {
                              setDraftAgencySlug(value);
                            }}
                            options={agencyAgents
                              .filter((a) => !agencyCategory || a.category === agencyCategory)
                              .map((agent) => ({
                                value: agent.slug,
                                label: agent.name,
                                category: agent.category,
                              }))}
                            placeholder="Select specialist..."
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => { agencyFetchRef.current = false; fetchAgencyAgents(); }}
                          className="w-full border-4 border-[#1a1a1a] bg-[#f5f0e8] px-3 py-2 font-headline text-xs font-black uppercase hover:bg-[#ffcc00] dark:border-[#f5f0e8] dark:bg-[#2a2a2a] dark:text-[#f5f0e8]"
                        >
                          Refresh Catalog
                        </button>
                      </>
                    )}
                    <div className="border-4 border-[#1a1a1a] bg-white p-4 dark:border-[#f5f0e8] dark:bg-[#1a1a1a]">
                      <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Project Files</p>
                      <p className="mt-2 font-body text-sm leading-relaxed opacity-80">
                        Nexus writes the selected specialist to <span className="font-mono">AGENCY.md</span> and keeps a manifest at <span className="font-mono">.nexus/agency-agents.json</span>.
                      </p>
                      <p className="mt-2 font-body text-sm leading-relaxed opacity-80">
                        Dropdown changes are staged only. Nexus updates the project files when you click <span className="font-mono">Apply Agency File</span> or toggle the feature.
                      </p>
                      <p className="mt-2 font-body text-sm leading-relaxed opacity-80">
                        Nexus only overwrites an existing <span className="font-mono">AGENCY.md</span> when that file was already created by Nexus, so existing manual project files stay protected.
                      </p>
                      <p className="mt-2 font-body text-sm leading-relaxed opacity-80">
                        This is project-scoped and PowerShell-safe because Nexus handles the file install directly instead of relying on upstream bash installers.
                      </p>
                    </div>
                  </div>
                </div>

                {agencyStatus ? (
                  <ActionFeedback
                    title="Agency Agent Result"
                    message={agencyStatus.message}
                    tone={agencyStatus.tone}
                  />
                ) : null}
              </div>

            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center border-4 border-dashed border-[#1a1a1a] bg-[#f5f0e8] p-10 text-center dark:border-[#f5f0e8] dark:bg-[#111111]">
              <p className="font-headline text-3xl font-black uppercase">No project registered</p>
              <p className="mt-3 max-w-xs font-body text-sm leading-relaxed opacity-70">
                Create a project to configure its folder, color, and startup agents.
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
  projects,
  settings,
  installedAgents,
  runtimeInfo,
  onUpdateSettings,
  onOpenAddCustomAgent,
  onInstallCaveman,
}: {
  projects: Project[];
  settings: AppSettings;
  installedAgents: InstalledAgentStatus[];
  runtimeInfo: RuntimeInfo;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onOpenAddCustomAgent: () => void;
  onInstallCaveman: (agentId: string) => Promise<string>;
}) {
  const agentCatalog = useMemo(() => [...KNOWN_AGENTS, ...settings.customAgents], [settings.customAgents]);
  const installedStatus = useMemo(
    () => new Map(installedAgents.map((e) => [e.id, e.installed])),
    [installedAgents],
  );
  const autoSyncAgentNames = useMemo(
    () =>
      new Map(
        agentCatalog
          .filter((agent) => MCP_AUTO_INSTALL_AGENT_IDS.includes(agent.id))
          .map((agent) => [agent.id, agent.name]),
      ),
    [agentCatalog],
  );
  const [cavemanRunningAgentId, setCavemanRunningAgentId] = useState<string | null>(null);
  const [cavemanStatus, setCavemanStatus] = useState<Record<string, { tone: "success" | "error"; message: string }>>({});
  const [selectedCavemanAgentId, setSelectedCavemanAgentId] = useState<string>("claude-code");
  const cavemanInstalledAgentIds = useMemo(
    () => new Set(settings.cavemanInstalledAgentIds ?? []),
    [settings.cavemanInstalledAgentIds],
  );
  const presetServerIds = useMemo(
    () => new Set(
      settings.mcpServers
        .map((server) => {
          const preset = MCP_SERVER_PRESETS.find((entry) => matchesMcpServerPreset(server, entry));
          return preset?.id ?? null;
        })
        .filter((presetId): presetId is string => Boolean(presetId)),
    ),
    [settings.mcpServers],
  );
  const removeCustomAgent = (agentId: string) => {
    onUpdateSettings({ customAgents: settings.customAgents.filter((a) => a.id !== agentId) });
  };
  const runCavemanInstall = async (agentId: string) => {
    setCavemanRunningAgentId(agentId);
    setCavemanStatus((current) => {
      const next = { ...current };
      delete next[agentId];
      return next;
    });
    try {
      const message = await onInstallCaveman(agentId);
      onUpdateSettings({
        cavemanInstalledAgentIds: Array.from(new Set<AgentId>([
          ...(settings.cavemanInstalledAgentIds ?? []),
          agentId,
        ])),
      });
      setCavemanStatus((current) => ({
        ...current,
        [agentId]: { tone: "success", message },
      }));
    } catch (error) {
      setCavemanStatus((current) => ({
        ...current,
        [agentId]: {
          tone: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      }));
    } finally {
      setCavemanRunningAgentId(null);
    }
  };
  const updateServer = (serverId: string, patch: Partial<McpServerConfig>) => {
    onUpdateSettings({
      mcpServers: settings.mcpServers.map((server) =>
        server.id === serverId ? { ...server, ...patch } : server,
      ),
    });
  };
  const removeServer = (serverId: string) => {
    onUpdateSettings({
      mcpServers: settings.mcpServers.filter((server) => server.id !== serverId),
    });
  };
  const addServer = () => {
    onUpdateSettings({
      mcpServers: [
        ...settings.mcpServers,
        {
          id: `mcp-${nanoid(6)}`,
          name: "NEW_SERVER",
          command: "",
          args: [],
          env: {},
          enabledAgentIds: [],
        },
      ],
    });
  };
  const addPresetServer = (presetId: string) => {
    const preset = MCP_SERVER_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;

    const nextServer = createMcpServerFromPreset(preset);
    const alreadyExists = settings.mcpServers.some(
      (server) => matchesMcpServerPreset(server, preset),
    );
    if (alreadyExists) {
      return;
    }

    onUpdateSettings({
      mcpServers: [...settings.mcpServers, nextServer],
    });
  };
  const removePresetServer = (presetId: string) => {
    const preset = MCP_SERVER_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;

    onUpdateSettings({
      mcpServers: settings.mcpServers.filter(
        (server) => !matchesMcpServerPreset(server, preset),
      ),
    });
  };
  const cavemanDropdownAgents = useMemo(
    () => agentCatalog.filter((agent) => CAVEMAN_ONE_CLICK_AGENT_IDS.has(agent.id) || agent.id === "codex"),
    [agentCatalog],
  );

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
        <StatTile label="MCP Servers" value={`${settings.mcpServers.length}`} accent="#10B981" />
      </div>

      <div className="space-y-4 border-4 border-[#1a1a1a] bg-white p-4 dark:border-[#f5f0e8] dark:bg-[#1a1a1a]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">MCP Server Registry</p>
            <p className="mt-0.5 font-headline text-xl font-black uppercase leading-none">Global Context Bridge</p>
            <p className="mt-1 max-w-3xl font-body text-xs leading-relaxed opacity-70">
              Shared MCP servers apply to every project. Auto-wired: <span className="font-mono">{Array.from(autoSyncAgentNames.values()).join(" + ") || "none"}</span>. Applies to {projects.length} project{projects.length === 1 ? "" : "s"}.
            </p>
          </div>
          <button
            type="button"
            onClick={addServer}
            className="shrink-0 border-4 border-[#1a1a1a] bg-[#ffcc00] px-3 py-2 font-headline text-xs font-black uppercase hover:bg-[#1a1a1a] hover:text-[#f5f0e8] dark:border-[#f5f0e8]"
          >
            Add MCP Server
          </button>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Preset Catalog</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MCP_SERVER_PRESETS.map((preset) => {
              const autoInstall = (preset.autoInstallAgents ?? [])
                .map((agentId) => autoSyncAgentNames.get(agentId))
                .filter(Boolean)
                .join(", ");
              const active = presetServerIds.has(preset.id);
              return (
                <PresetCard
                  key={preset.id}
                  title={preset.name}
                  description={preset.description}
                  docsUrl={preset.docsUrl}
                  active={active}
                  meta={`${preset.command}${autoInstall ? ` • ${autoInstall}` : ""}`}
                  onToggle={() => {
                    if (active) {
                      removePresetServer(preset.id);
                      return;
                    }
                    addPresetServer(preset.id);
                  }}
                />
              );
            })}
          </div>
        </div>

        {settings.mcpServers.length ? (
          <div className="space-y-3">
            {settings.mcpServers.map((server, index) => (
              <article key={server.id} className="border-4 border-[#1a1a1a] bg-[#f5f0e8] p-3 dark:border-[#f5f0e8] dark:bg-[#111111]">
                <div className="flex items-center justify-between gap-3 border-b-2 border-[#1a1a1a] pb-2 dark:border-[#f5f0e8]">
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-[0.3em] opacity-60">
                      #{String(index + 1).padStart(2, "0")} {server.args.length} args · {countConfiguredEnv(server.env)} env · {server.enabledAgentIds.length} agents
                    </p>
                    <h4 className="mt-0.5 font-headline text-lg font-black uppercase leading-none truncate">
                      {server.name || "Unnamed Server"}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeServer(server.id)}
                    className="shrink-0 border-4 border-[#1a1a1a] bg-white px-2 py-1 font-headline text-xs font-black uppercase hover:bg-[#e63b2e] hover:text-white dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8]"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_160px]">
                  <TextInput value={server.name} onChange={(v) => updateServer(server.id, { name: v })} placeholder="Name" />
                  <TextInput value={server.command} onChange={(v) => updateServer(server.id, { command: v })} mono placeholder="Command" />
                  <TextInput value={formatArgs(server.args)} onChange={(v) => updateServer(server.id, { args: parseArgsInput(v) })} mono placeholder="Args" />
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <TextArea
                    value={formatEnv(server.env)}
                    onChange={(v) => updateServer(server.id, { env: parseEnvInput(v) })}
                    placeholder="API_KEY=...\nDEBUG=true"
                    minRows={2}
                  />
                  <div className="flex flex-wrap gap-1.5 content-start">
                    {agentCatalog.map((agent) => {
                      const enabled = server.enabledAgentIds.includes(agent.id);
                      return (
                        <button
                          key={`${server.id}-${agent.id}`}
                          type="button"
                          onClick={() => {
                            const enabledAgentIds = enabled
                              ? server.enabledAgentIds.filter((entry) => entry !== agent.id)
                              : [...server.enabledAgentIds, agent.id];
                            updateServer(server.id, { enabledAgentIds });
                          }}
                          className={`border-2 px-2 py-0.5 font-headline text-[10px] font-black uppercase ${enabled ? "border-[#1a1a1a] bg-[#1a1a1a] text-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#f5f0e8] dark:text-[#1a1a1a]" : "border-[#1a1a1a] bg-white text-[#1a1a1a] hover:bg-[#ffcc00] dark:border-[#f5f0e8] dark:bg-[#2a2a2a] dark:text-[#f5f0e8]"}`}
                        >
                          {agent.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="border-4 border-dashed border-[#1a1a1a] bg-[#f5f0e8] p-4 text-center dark:border-[#f5f0e8] dark:bg-[#111111]">
            <p className="font-headline text-lg font-black uppercase">No MCP servers yet</p>
            <p className="mx-auto mt-1 max-w-xl font-body text-xs leading-relaxed opacity-70">
              Add a shared server here and Nexus will wire or inject it across every project for the agents you enable.
            </p>
          </div>
        )}
      </div>

      {/* Compact Caveman installer */}
      <div className="space-y-3 border-4 border-[#1a1a1a] bg-white p-4 dark:border-[#f5f0e8] dark:bg-[#1a1a1a]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">Agent Add-On</p>
            <p className="mt-0.5 font-headline text-lg font-black uppercase leading-none">Caveman</p>
            <p className="mt-1 max-w-2xl font-body text-xs leading-relaxed opacity-70">
              Terse-response / prompt-compression add-on. One-click for Claude, Gemini, Cline, Kiro. Codex is manual.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runCavemanInstall(selectedCavemanAgentId)}
            disabled={cavemanRunningAgentId === selectedCavemanAgentId || (!CAVEMAN_ONE_CLICK_AGENT_IDS.has(selectedCavemanAgentId) && selectedCavemanAgentId !== "codex")}
            className="shrink-0 border-4 border-[#1a1a1a] bg-[#10B981] px-3 py-2 font-headline text-xs font-black uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f5f0e8] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#f5f0e8]"
          >
            {cavemanRunningAgentId === selectedCavemanAgentId
              ? "Installing..."
              : cavemanInstalledAgentIds.has(selectedCavemanAgentId)
                ? "Reinstall"
                : "Install"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {cavemanDropdownAgents.map((agent) => (
            <button
              key={`caveman-${agent.id}`}
              type="button"
              onClick={() => setSelectedCavemanAgentId(agent.id)}
              className={`border-4 px-3 py-2 font-headline text-xs font-black uppercase ${
                selectedCavemanAgentId === agent.id
                  ? "border-[#1a1a1a] bg-[#1a1a1a] text-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#f5f0e8] dark:text-[#1a1a1a]"
                  : "border-[#1a1a1a] bg-white text-[#1a1a1a] hover:bg-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#2a2a2a] dark:text-[#f5f0e8]"
              }`}
            >
              {agent.name}
            </button>
          ))}
        </div>
        {cavemanStatus[selectedCavemanAgentId] ? (
          <ActionFeedback
            title="Caveman Result"
            message={cavemanStatus[selectedCavemanAgentId].message}
            tone={cavemanStatus[selectedCavemanAgentId].tone}
          />
        ) : null}
      </div>

      {/* Runtime sidebar + compact agent list */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_200px]">
        <div className="space-y-3">
          {agentCatalog.map((agent) => {
            const isCustom = settings.customAgents.some((e) => e.id === agent.id);
            const installed = isCustom ? true : installedStatus.get(agent.id) ?? false;
            const defaultArgs = settings.defaultAgentArgs[agent.id] ?? formatArgs(agent.args);

            return (
              <article key={agent.id} className="border-4 border-[#1a1a1a] bg-[#f5f0e8] p-3 dark:border-[#f5f0e8] dark:bg-[#111111]">
                <div className="flex items-center justify-between gap-3 border-b-2 border-[#1a1a1a] pb-2 dark:border-[#f5f0e8]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-3 w-3 shrink-0 border border-[#1a1a1a] dark:border-[#f5f0e8]" style={{ backgroundColor: agent.color }} />
                    <h3 className="font-headline text-base font-black uppercase leading-none truncate">{agent.name}</h3>
                    <span
                      className={`shrink-0 border-2 px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.2em] ${installed ? "border-[#1a1a1a] bg-[#1a1a1a] text-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#f5f0e8] dark:text-[#1a1a1a]" : "border-[#1a1a1a] bg-white text-[#1a1a1a] dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8]"}`}
                    >
                      {isCustom ? "Custom" : installed ? "Installed" : "Missing"}
                    </span>
                  </div>
                  {isCustom ? (
                    <button
                      type="button"
                      onClick={() => removeCustomAgent(agent.id)}
                      className="shrink-0 border-4 border-[#1a1a1a] bg-white px-2 py-1 font-headline text-xs font-black uppercase hover:bg-[#e63b2e] hover:text-white dark:border-[#f5f0e8] dark:bg-[#1a1a1a] dark:text-[#f5f0e8]"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px]">
                  <TextArea
                    value={defaultArgs}
                    onChange={(value) =>
                      onUpdateSettings({ defaultAgentArgs: { [agent.id]: value } })
                    }
                    placeholder="--flag value"
                    minRows={2}
                  />
                  <div className="space-y-1 text-xs">
                    <p className="font-mono text-[9px] uppercase tracking-[0.25em] opacity-60">Command</p>
                    <p className="break-all font-headline text-sm font-black uppercase">{agent.command}</p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.25em] opacity-60">Args</p>
                    <p className="font-headline text-sm font-black">{parseArgsInput(defaultArgs).length}</p>
                    {agent.cwdOverride ? (
                      <>
                        <p className="font-mono text-[9px] uppercase tracking-[0.25em] opacity-60">CWD</p>
                        <p className="break-all font-mono text-[10px]">{agent.cwdOverride}</p>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void runCavemanInstall(agent.id)}
                      disabled={cavemanRunningAgentId === agent.id || !CAVEMAN_ONE_CLICK_AGENT_IDS.has(agent.id)}
                      className="mt-1 w-full border-4 border-[#1a1a1a] bg-[#10B981] px-2 py-1 font-headline text-[10px] font-black uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#f5f0e8] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#f5f0e8]"
                    >
                      {cavemanRunningAgentId === agent.id
                        ? "..."
                        : cavemanInstalledAgentIds.has(agent.id)
                          ? "Reinstall Caveman"
                          : "Install Caveman"}
                    </button>
                    {cavemanStatus[agent.id] ? (
                      <ActionFeedback
                        title="Caveman"
                        message={cavemanStatus[agent.id].message}
                        tone={cavemanStatus[agent.id].tone}
                      />
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Sidebar info */}
        <aside className="space-y-3">
          <div className="border-4 border-[#1a1a1a] bg-[#1a1a1a] p-3 text-[#f5f0e8] dark:border-[#f5f0e8] dark:bg-[#f5f0e8] dark:text-[#1a1a1a]">
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] opacity-60">Runtime</p>
            <p className="mt-1 font-headline text-xl font-black uppercase leading-none">{formatRuntimeOsLabel(runtimeInfo.os)}</p>
            <p className="mt-1 font-body text-xs leading-relaxed">
              Shell: <span className="font-mono">{formatRuntimeShellLabel(runtimeInfo.shell)}</span>
            </p>
          </div>

          <div className="border-4 border-[#1a1a1a] bg-[#f5f0e8] p-3 dark:border-[#f5f0e8] dark:bg-[#111111] dark:text-[#f5f0e8]">
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] opacity-60">MCP Strategy</p>
            <p className="mt-1 font-headline text-sm font-black uppercase leading-tight">
              Configure once. Apply everywhere.
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
  onBootstrapSpecKit,
  onInstallCaveman,
  onListAgencyAgents,
  onSyncProjectAgencyAgent,
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
                <TerminalSection settings={settings} runtimeInfo={runtimeInfo} onUpdateSettings={onUpdateSettings} />
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
                  onBootstrapSpecKit={onBootstrapSpecKit}
                  onListAgencyAgents={onListAgencyAgents}
                  onSyncProjectAgencyAgent={onSyncProjectAgencyAgent}
                />
              )}
              {section === "agents" && (
                <AgentsPanel
                  projects={projects}
                  settings={settings}
                  installedAgents={installedAgents}
                  runtimeInfo={runtimeInfo}
                  onUpdateSettings={onUpdateSettings}
                  onOpenAddCustomAgent={onOpenAddCustomAgent}
                  onInstallCaveman={onInstallCaveman}
                />
              )}
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}
