import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CAVEMAN_ONE_CLICK_AGENT_IDS,
  DEFAULT_AGENCY_AGENT_SLUG,
  KNOWN_AGENTS,
  PROJECT_SWATCHES,
  SPEC_KIT_SUPPORTED_AGENT_IDS,
} from "../../constants/agents";
import { MCP_SERVER_PRESETS, createMcpServerFromPreset, matchesMcpServerPreset } from "../../constants/mcpPresets";
import { getImageDataUrl } from "../../lib/imageDataUrl";
import type { AddProjectDraft, AgentId, ProjectCategory } from "../../types";

interface AgencyAgentOption {
  slug: string;
  name: string;
  category: string;
}

interface AddProjectDialogProps {
  onClose: () => void;
  onSubmit: (draft: AddProjectDraft) => Promise<void>;
  onListAgencyAgents?: () => Promise<AgencyAgentOption[]>;
}

function getNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

function getInitials(name: string) {
  return name
    .split(/[\s\-_]+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const PROJECT_CATEGORIES: { value: ProjectCategory; label: string }[] = [
  { value: "web", label: "Web" },
  { value: "app", label: "App" },
  { value: "game", label: "Game" },
  { value: "api", label: "API / Backend" },
  { value: "ml", label: "ML / AI" },
  { value: "tool", label: "CLI Tool" },
  { value: "other", label: "Other" },
];

function AgencyDropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; category?: string }>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
                  {option.category ? (
                    <span className="shrink-0 border-2 border-[#1a1a1a]/30 px-1.5 py-0.5 font-headline text-[9px] font-black uppercase dark:border-[#f5f0e8]/30">
                      {option.category}
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

export function AddProjectDialog({
  onClose,
  onSubmit,
  onListAgencyAgents,
}: AddProjectDialogProps) {
  const [draft, setDraft] = useState<AddProjectDraft>({
    name: "",
    path: "",
    color: PROJECT_SWATCHES[0],
    category: "other",
    defaultAgents: [],
    mcpServers: [],
    agencyAgent: {
      enabled: false,
      selectedAgentSlug: DEFAULT_AGENCY_AGENT_SLUG,
    },
    specKit: {
      enabled: false,
      agentId: "codex",
    },
    cavemanAgentIds: [],
    mcpPresetIds: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [iconPreview, setIconPreview] = useState<string | null>(null);

  const [agencyAgents, setAgencyAgents] = useState<AgencyAgentOption[]>([]);
  const [agencyLoading, setAgencyLoading] = useState(false);
  const [agencyFetched, setAgencyFetched] = useState(false);

  const [mcpPresetServerIds, setMcpPresetServerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!draft.icon) {
      setIconPreview(null);
      return;
    }
    let cancelled = false;
    void getImageDataUrl(draft.icon).then((url) => {
      if (!cancelled) setIconPreview(url);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.icon]);

  const pickDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select a project folder",
    });
    if (typeof selected !== "string") return;
    setDraft((current) => ({
      ...current,
      path: selected,
      name: current.name || getNameFromPath(selected),
    }));
  };

  const pickIcon = async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      title: "Select a PNG icon",
      filters: [{ name: "Images", extensions: ["png"] }],
    });
    if (typeof selected !== "string") return;
    setDraft((current) => ({ ...current, icon: selected }));
  };

  const clearIcon = () => {
    setDraft((current) => ({ ...current, icon: undefined }));
  };

  const fetchAgencyAgents = useCallback(async () => {
    if (!onListAgencyAgents || agencyFetched) return;
    setAgencyLoading(true);
    try {
      const list = await onListAgencyAgents();
      setAgencyAgents(list);
      setAgencyFetched(true);
    } catch {
      setAgencyAgents([]);
      setAgencyFetched(true);
    } finally {
      setAgencyLoading(false);
    }
  }, [onListAgencyAgents, agencyFetched]);

  const toggleMcpPreset = (presetId: string) => {
    setMcpPresetServerIds((current) => {
      const next = new Set(current);
      if (next.has(presetId)) {
        next.delete(presetId);
      } else {
        next.add(presetId);
      }
      return next;
    });
  };

  const toggleCavemanAgent = (agentId: AgentId) => {
    setDraft((current) => {
      const has = current.cavemanAgentIds.includes(agentId);
      return {
        ...current,
        cavemanAgentIds: has
          ? current.cavemanAgentIds.filter((id) => id !== agentId)
          : [...current.cavemanAgentIds, agentId],
      };
    });
  };

  const agencyCategories = useMemo(
    () => Array.from(new Set(agencyAgents.map((a) => a.category))).sort(),
    [agencyAgents],
  );

  const currentAgencyName = useMemo(() => {
    return (
      agencyAgents.find((a) => a.slug === draft.agencyAgent?.selectedAgentSlug)?.name ??
      draft.agencyAgent?.selectedAgentSlug ??
      DEFAULT_AGENCY_AGENT_SLUG
    );
  }, [agencyAgents, draft.agencyAgent?.selectedAgentSlug]);

  const submit = async () => {
    if (!draft.name.trim() || !draft.path.trim()) return;

    const mcpServers = Array.from(mcpPresetServerIds)
      .map((id) => {
        const preset = MCP_SERVER_PRESETS.find((p) => p.id === id);
        return preset ? createMcpServerFromPreset(preset) : null;
      })
      .filter(Boolean) as AddProjectDraft["mcpServers"];

    setSubmitting(true);
    try {
      await onSubmit({
        ...draft,
        name: draft.name.trim(),
        path: draft.path.trim(),
        mcpServers,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-['Space_Grotesk']"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="w-full max-w-2xl bg-[#f5f0e8] dark:bg-[#1a1a1a] border-8 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#f5f0e8] flex flex-col shadow-[8px_8px_0px_0px_#1a1a1a] dark:shadow-[8px_8px_0px_0px_#f5f0e8] max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-project-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a] p-4 flex justify-between items-center z-10 shrink-0">
          <h2 id="add-project-title" className="font-['Space_Grotesk'] font-bold uppercase text-2xl tracking-tighter">
            Add Project
          </h2>
          <button className="material-symbols-outlined hover:text-[#e63b2e]" onClick={onClose} type="button">
            close
          </button>
        </div>

        <div className="p-8 flex flex-col gap-6 overflow-y-auto font-['Space_Grotesk'] shadow-inner">
          {/* Project Name */}
          <div className="flex flex-col gap-2">
            <label className="uppercase font-black text-sm tracking-wider">Project Name</label>
            <input
              className="w-full bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-4 font-body font-bold text-lg outline-none focus:border-[#0055ff] transition-colors"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Nexus Frontend"
            />
          </div>

          {/* Project Path */}
          <div className="flex flex-col gap-2">
            <label className="uppercase font-black text-sm tracking-wider">Project Path</label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-4 font-mono font-bold text-lg outline-none focus:border-[#0055ff] transition-colors"
                value={draft.path}
                onChange={(event) => setDraft((current) => ({ ...current, path: event.target.value }))}
                placeholder="/path/to/directory"
              />
              <button
                className="bg-[#ffcc00] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] px-6 font-black uppercase neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all active:bg-[#1a1a1a] active:text-[#ffcc00]"
                onClick={() => void pickDirectory()}
                type="button"
              >
                BROWSE
              </button>
            </div>
          </div>

          {/* Accent Color */}
          <div className="flex flex-col gap-2 mt-4 text-[#1a1a1a] dark:text-[#f5f0e8]">
            <label className="uppercase font-black text-sm tracking-wider">Accent Color</label>
            <div className="flex gap-4 flex-wrap">
              {PROJECT_SWATCHES.map((swatch) => {
                const selected = draft.color === swatch;
                return (
                  <button
                    key={swatch}
                    className={`w-12 h-12 border-4 transition-all ${
                      selected
                        ? "border-[#1a1a1a] dark:border-[#f5f0e8] shadow-[4px_4px_0px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_0px_#f5f0e8] scale-110 translate-y-[-4px]"
                        : "border-transparent hover:border-black/30 dark:hover:border-white/30"
                    }`}
                    onClick={() => setDraft((current) => ({ ...current, color: swatch }))}
                    style={{ background: swatch }}
                    type="button"
                    title={`Select color ${swatch}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Project Icon */}
          <div className="flex flex-col gap-2 mt-4 text-[#1a1a1a] dark:text-[#f5f0e8]">
            <label className="uppercase font-black text-sm tracking-wider flex justify-between items-end">
              <span>Project Icon</span>
              <span className="text-xs opacity-50 font-normal">PNG square image</span>
            </label>
            <div className="flex items-center gap-4">
              <div
                className="shrink-0 flex items-center justify-center font-black text-sm border-2 border-[#1a1a1a] dark:border-[#f5f0e8]"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 4,
                  background: draft.color ?? "#1a1a1a",
                  color: "#fff",
                  overflow: "hidden",
                }}
              >
                {iconPreview ? (
                  <img src={iconPreview} alt="icon" className="w-full h-full object-cover" />
                ) : (
                  getInitials(draft.name || "PJ")
                )}
              </div>
              <div className="flex gap-2">
                <button
                  className="bg-[#ffcc00] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] px-4 py-2 font-black uppercase text-xs neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all"
                  onClick={() => void pickIcon()}
                  type="button"
                >
                  Pick PNG
                </button>
                {draft.icon && (
                  <button
                    className="border-4 border-[#1a1a1a] dark:border-[#f5f0e8] px-4 py-2 font-black uppercase text-xs hover:bg-[#e63b2e] hover:text-white hover:border-[#e63b2e] transition-all"
                    onClick={clearIcon}
                    type="button"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Project Category */}
          <div className="flex flex-col gap-2 mt-4">
            <label className="uppercase font-black text-sm tracking-wider">Project Category</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PROJECT_CATEGORIES.map((cat) => {
                const selected = draft.category === cat.value;
                return (
                  <button
                    key={cat.value}
                    className={`border-4 p-3 font-bold text-sm uppercase transition-colors ${
                      selected
                        ? "border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a]"
                        : "border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#1a1a1a] hover:bg-[#ffcc00] dark:hover:bg-[#ffcc00] dark:hover:text-[#1a1a1a]"
                    }`}
                    onClick={() => setDraft((current) => ({ ...current, category: cat.value }))}
                    type="button"
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Agency */}
          <div className="flex flex-col gap-3 mt-4 border-t-4 border-[#1a1a1a] dark:border-[#f5f0e8] pt-5">
            <div className="flex items-center justify-between">
              <label className="uppercase font-black text-sm tracking-wider">AI Agency</label>
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    agencyAgent: {
                      enabled: !(current.agencyAgent?.enabled ?? false),
                      selectedAgentSlug: current.agencyAgent?.selectedAgentSlug ?? DEFAULT_AGENCY_AGENT_SLUG,
                    },
                  }))
                }
                className={`relative h-8 w-16 border-4 border-[#1a1a1a] transition-none dark:border-[#f5f0e8] ${
                  draft.agencyAgent?.enabled ? "bg-[#10B981]" : "bg-white dark:bg-[#1a1a1a]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 border-2 border-[#1a1a1a] bg-[#1a1a1a] transition-none dark:border-[#f5f0e8] dark:bg-[#f5f0e8] ${
                    draft.agencyAgent?.enabled ? "right-0.5" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            {draft.agencyAgent?.enabled && (
              <div className="flex flex-col gap-3">
                {!agencyFetched && !agencyLoading && (
                  <button
                    type="button"
                    onClick={() => void fetchAgencyAgents()}
                    className="w-full border-4 border-[#1a1a1a] dark:border-[#f5f0e8] px-4 py-3 font-black uppercase text-xs hover:bg-[#ffcc00] transition-all"
                  >
                    Load Agency Catalog
                  </button>
                )}
                {agencyLoading && (
                  <div className="flex items-center gap-2 font-mono text-xs opacity-60">
                    <span className="material-symbols-outlined animate-spin">sync</span>
                    Fetching agency catalog…
                  </div>
                )}
                {agencyFetched && agencyAgents.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {/* Category filter */}
                    <div className="flex flex-wrap gap-1">
                      {agencyCategories.map((cat) => {
                        const selected =
                          draft.agencyAgent?.selectedAgentSlug &&
                          agencyAgents.find((a) => a.slug === draft.agencyAgent?.selectedAgentSlug)?.category === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              const first = agencyAgents.find((a) => a.category === cat);
                              if (first) {
                                setDraft((current) => ({
                                  ...current,
                                  agencyAgent: {
                                    ...current.agencyAgent!,
                                    selectedAgentSlug: first.slug,
                                  },
                                }));
                              }
                            }}
                            className={`px-2 py-0.5 font-mono text-[9px] font-bold uppercase border-2 transition-none cursor-pointer ${
                              selected
                                ? "border-[#ffcc00] bg-[#ffcc00] text-[#1a1a1a]"
                                : "border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#888] hover:border-[#ffcc00] hover:text-[#ffcc00] bg-transparent"
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                    {/* Agent dropdown */}
                    <AgencyDropdown
                      value={draft.agencyAgent?.selectedAgentSlug ?? DEFAULT_AGENCY_AGENT_SLUG}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          agencyAgent: {
                            enabled: current.agencyAgent?.enabled ?? false,
                            selectedAgentSlug: value,
                          },
                        }))
                      }
                      options={agencyAgents.map((agent) => ({
                        value: agent.slug,
                        label: agent.name,
                        category: agent.category,
                      }))}
                      placeholder="Select agency personality..."
                    />
                  </div>
                )}
                {agencyFetched && agencyAgents.length === 0 && (
                  <p className="font-mono text-xs opacity-50">No agency agents found.</p>
                )}
              </div>
            )}
          </div>

          {/* MCP Presets */}
          <div className="flex flex-col gap-3 mt-4 border-t-4 border-[#1a1a1a] dark:border-[#f5f0e8] pt-5">
            <label className="uppercase font-black text-sm tracking-wider flex justify-between items-end">
              <span>MCP Presets</span>
              <span className="text-xs opacity-50 font-normal">Global workspace servers</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {MCP_SERVER_PRESETS.map((preset) => {
                const selected = mcpPresetServerIds.has(preset.id);
                return (
                  <button
                    key={preset.id}
                    className={`flex flex-col gap-1 border-4 p-3 text-left transition-colors ${
                      selected
                        ? "border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a]"
                        : "border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#1a1a1a] hover:bg-[#ffcc00] dark:hover:bg-[#ffcc00] dark:hover:text-[#1a1a1a]"
                    }`}
                    onClick={() => toggleMcpPreset(preset.id)}
                    type="button"
                  >
                    <span className="font-bold text-sm truncate">{preset.name}</span>
                    <span className="text-[10px] opacity-60 truncate">{preset.command}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Spec Kit */}
          <div className="flex flex-col gap-3 mt-4 border-t-4 border-[#1a1a1a] dark:border-[#f5f0e8] pt-5">
            <div className="flex items-center justify-between">
              <label className="uppercase font-black text-sm tracking-wider">Spec Kit</label>
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    specKit: {
                      enabled: !(current.specKit?.enabled ?? false),
                      agentId: current.specKit?.agentId ?? "codex",
                    },
                  }))
                }
                className={`relative h-8 w-16 border-4 border-[#1a1a1a] transition-none dark:border-[#f5f0e8] ${
                  draft.specKit?.enabled ? "bg-[#0055ff]" : "bg-white dark:bg-[#1a1a1a]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 border-2 border-[#1a1a1a] bg-[#1a1a1a] transition-none dark:border-[#f5f0e8] dark:bg-[#f5f0e8] ${
                    draft.specKit?.enabled ? "right-0.5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            {draft.specKit?.enabled && (
              <div className="flex flex-wrap gap-2">
                {KNOWN_AGENTS.filter((agent) => SPEC_KIT_SUPPORTED_AGENT_IDS.has(agent.id)).map((agent) => {
                  const selected = draft.specKit?.agentId === agent.id;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          specKit: { ...current.specKit!, agentId: agent.id },
                        }))
                      }
                      className={`flex items-center gap-2 border-4 px-3 py-2 transition-colors ${
                        selected
                          ? "border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a]"
                          : "border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#1a1a1a] hover:bg-[#ffcc00] dark:hover:bg-[#ffcc00] dark:hover:text-[#1a1a1a]"
                      }`}
                    >
                      <span className="w-3 h-3 border border-white dark:border-[#1a1a1a] shrink-0" style={{ background: agent.color }} />
                      <span className="font-bold text-sm truncate">{agent.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Caveman */}
          <div className="flex flex-col gap-3 mt-4 border-t-4 border-[#1a1a1a] dark:border-[#f5f0e8] pt-5">
            <label className="uppercase font-black text-sm tracking-wider flex justify-between items-end">
              <span>Caveman</span>
              <span className="text-xs opacity-50 font-normal">Install terse-response add-on</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {KNOWN_AGENTS.filter((agent) => CAVEMAN_ONE_CLICK_AGENT_IDS.has(agent.id)).map((agent) => {
                const selected = draft.cavemanAgentIds.includes(agent.id);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleCavemanAgent(agent.id)}
                    className={`flex items-center gap-2 border-4 px-3 py-2 transition-colors ${
                      selected
                        ? "border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a]"
                        : "border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#1a1a1a] hover:bg-[#ffcc00] dark:hover:bg-[#ffcc00] dark:hover:text-[#1a1a1a]"
                    }`}
                  >
                    <span className="w-3 h-3 border border-white dark:border-[#1a1a1a] shrink-0" style={{ background: agent.color }} />
                    <span className="font-bold text-sm truncate">{agent.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 border-t-8 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#f5f0e8] dark:bg-[#1a1a1a] flex justify-end gap-4 shrink-0">
          <button
            className="px-6 py-3 font-black uppercase tracking-widest border-4 border-transparent hover:border-[#1a1a1a] dark:hover:border-[#f5f0e8] hover:bg-white dark:hover:bg-[#121212] transition-all text-[#1a1a1a] dark:text-[#f5f0e8]"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="bg-[#0055ff] text-white border-4 border-[#1a1a1a] dark:border-[#f5f0e8] px-8 py-3 font-black uppercase neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!draft.name.trim() || !draft.path.trim() || submitting}
            onClick={() => void submit()}
            type="button"
          >
            {submitting ? "SAVING..." : "CREATE PROJECT"}
          </button>
        </div>
      </section>
    </div>
  );
}
