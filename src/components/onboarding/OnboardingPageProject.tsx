import { useContext, useState, useCallback } from "react";
import { OnboardingContext } from "./Onboarding";
import { isTauri } from "../../lib/api";
import { KNOWN_AGENTS, PROJECT_SWATCHES, SPEC_KIT_SUPPORTED_AGENT_IDS } from "../../constants/agents";
import type { Project, ProjectCategory } from "../../types";

const PROJECT_CATEGORIES: { value: ProjectCategory; label: string }[] = [
  { value: "web", label: "Web" },
  { value: "app", label: "App" },
  { value: "game", label: "Game" },
  { value: "api", label: "API / Backend" },
  { value: "ml", label: "ML / AI" },
  { value: "tool", label: "CLI Tool" },
  { value: "other", label: "Other" },
];

interface OnboardingPageProjectProps {
  visible: boolean;
  installedAgents: string[];
  onFinish?: (project: Project) => void;
}

export function OnboardingPageProject({ visible, installedAgents, onFinish }: OnboardingPageProjectProps) {
  const { projectDraft, setProjectDraft } = useContext(OnboardingContext);

  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [category, setCategory] = useState<ProjectCategory>("other");
  const [color, setColor] = useState(PROJECT_SWATCHES[0]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(installedAgents);
  const [specKit, setSpecKit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    );
  }, []);

  const handleBrowse = useCallback(async () => {
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({ directory: true, multiple: false });
        if (selected && typeof selected === "string") {
          setPath(selected);
          if (!name) {
            const dirName = selected.split(/[\\/]/).filter(Boolean).pop() ?? "";
            setName(dirName);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }, [name]);

  const handleFinish = useCallback(async () => {
    if (!name.trim() || !path.trim() || !onFinish) return;
    setSubmitting(true);

    // Build a minimal project object. The full Project gets created by the parent's addProject call.
    // We construct a project-like object here and pass it up. The actual persistence happens in App.tsx.
    const now = Date.now();
    const project: Project = {
      id: "", // will be filled by addProject
      name: name.trim(),
      path: path.trim(),
      color,
      category,
      defaultAgents: selectedAgents,
      mcpServers: [],
      agencyAgent: projectDraft.agencyAgent,
      specKit: specKit ? { enabled: true, agentId: "codex" } : { enabled: false, agentId: null },
      createdAt: now,
      sortOrder: now,
    };

    onFinish(project);
    setSubmitting(false);
  }, [name, path, color, category, selectedAgents, specKit, projectDraft.agencyAgent, onFinish]);

  const valid = name.trim() && path.trim();
  const installedAgentConfigs = KNOWN_AGENTS.filter((a) => installedAgents.includes(a.id));

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
    >
      <h2 className="font-['Space_Grotesk'] font-black text-3xl uppercase text-[#f5f0e8] tracking-tighter">
        Add Your First Project
      </h2>

      <div className="w-full max-w-lg bg-[#1a1a1a] border-4 border-[#2a2a2a] p-6 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
        {/* Name */}
        <div className="flex flex-col gap-2">
          <label className="font-['Space_Grotesk'] font-bold text-xs uppercase tracking-widest text-[#888]">
            Project Name
          </label>
          <input
            className="w-full bg-[#0d0d0d] border-3 border-[#333] p-3 font-mono text-sm text-[#f5f0e8] outline-none focus:border-[#ffcc00] placeholder-[#555]"
            placeholder="e.g. My Awesome App"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={visible}
          />
        </div>

        {/* Path */}
        <div className="flex flex-col gap-2">
          <label className="font-['Space_Grotesk'] font-bold text-xs uppercase tracking-widest text-[#888]">
            Project Path
          </label>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-[#0d0d0d] border-3 border-[#333] p-3 font-mono text-sm text-[#f5f0e8] outline-none focus:border-[#ffcc00] placeholder-[#555]"
              placeholder="/path/to/project"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void handleBrowse()}
              className="shrink-0 bg-[#ffcc00] border-3 border-[#ffcc00] px-4 font-['Space_Grotesk'] font-black text-sm uppercase text-[#1a1a1a] hover:bg-[#e6b800] transition-colors"
            >
              <span className="material-symbols-outlined text-base">folder_open</span>
            </button>
          </div>
        </div>

        {/* Category */}
        <div className="flex flex-col gap-2">
          <label className="font-['Space_Grotesk'] font-bold text-xs uppercase tracking-widest text-[#888]">
            Category
          </label>
          <div className="grid grid-cols-3 gap-2">
            {PROJECT_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={`border-3 p-2 font-['Space_Grotesk'] font-bold text-xs uppercase transition-colors ${
                  category === cat.value
                    ? "border-[#ffcc00] bg-[#ffcc00] text-[#1a1a1a]"
                    : "border-[#333] text-[#888] hover:border-[#555] hover:text-[#ccc]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div className="flex flex-col gap-2">
          <label className="font-['Space_Grotesk'] font-bold text-xs uppercase tracking-widest text-[#888]">
            Accent Color
          </label>
          <div className="flex gap-3">
            {PROJECT_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                className={`w-10 h-10 border-3 transition-all ${
                  color === swatch
                    ? "border-[#ffcc00] scale-110 shadow-[3px_3px_0px_0px_#ffcc00]"
                    : "border-[#333] hover:border-[#555]"
                }`}
                style={{ background: swatch }}
              />
            ))}
          </div>
        </div>

        {/* Default Agents */}
        <div className="flex flex-col gap-2">
          <label className="font-['Space_Grotesk'] font-bold text-xs uppercase tracking-widest text-[#888]">
            Default Agents
            <span className="font-normal opacity-50 ml-1">— will auto-launch on open</span>
          </label>
          {installedAgentConfigs.length === 0 ? (
            <p className="font-mono text-xs text-[#666] italic">
              No AI agents detected. Install one to get started.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {installedAgentConfigs.map((agent) => {
                const selected = selectedAgents.includes(agent.id);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    className={`flex items-center gap-2 border-3 p-2 transition-colors text-left ${
                      selected
                        ? "border-[#ffcc00] bg-[#ffcc00]/10 text-[#f5f0e8]"
                        : "border-[#333] text-[#888] hover:border-[#555]"
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: agent.color }}
                    />
                    <span className="font-['Space_Grotesk'] font-bold text-xs uppercase truncate">
                      {agent.name}
                    </span>
                    {selected && (
                      <span className="material-symbols-outlined text-xs text-[#ffcc00] ml-auto">
                        check
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Spec Kit */}
        <div className="flex items-center justify-between border-t-3 border-[#2a2a2a] pt-4">
          <div>
            <span className="font-['Space_Grotesk'] font-bold text-xs uppercase text-[#888]">
              Spec Kit
            </span>
            <p className="font-mono text-[10px] text-[#555] mt-0.5">
              Initialize .specify for structured AI-driven development
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSpecKit((v) => !v)}
            className={`relative h-7 w-14 border-3 border-[#333] transition-colors ${
              specKit ? "bg-[#0055ff] border-[#0055ff]" : "bg-transparent"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 bg-[#f5f0e8] transition-all ${
                specKit ? "right-0.5" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Finish button — shown only on this page, replaces the right arrow */}
      <button
        type="button"
        onClick={() => void handleFinish()}
        disabled={!valid || submitting}
        className="absolute right-6 top-1/2 -translate-y-1/2 z-10 w-14 h-14 border-4 border-[#10B981] bg-[#1a1a1a] text-[#10B981] flex items-center justify-center hover:bg-[#10B981] hover:text-[#1a1a1a] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-[#1a1a1a] disabled:hover:text-[#10B981]"
        aria-label="Finish setup"
        title="Finish setup"
      >
        <span className="material-symbols-outlined text-3xl">check</span>
      </button>
    </div>
  );
}
