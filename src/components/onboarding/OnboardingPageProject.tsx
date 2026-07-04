import { useContext, useState, useCallback, useEffect } from "react";
import { OnboardingContext } from "./Onboarding";
import { KNOWN_AGENTS, PROJECT_SWATCHES } from "../../constants/agents";
import type { Project, ProjectCategory } from "../../types";
import { FilePicker } from "../FilePicker/FilePicker";
import { API_BASE } from "../../lib/api";
import { getImageDataUrl } from "../../lib/imageDataUrl";
import { useProjectStore } from "../../store/projectStore";

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
  onFinish?: (project: Project | null) => void;
}

export function OnboardingPageProject({ visible, installedAgents, onFinish }: OnboardingPageProjectProps) {
  const { projectDraft } = useContext(OnboardingContext);
  const projects = useProjectStore((s) => s.projects);
  const hasExistingProjects = projects.length > 0;

  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [category, setCategory] = useState<ProjectCategory>("other");
  const [color, setColor] = useState(PROJECT_SWATCHES[0]);
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(installedAgents);
  const [specKit, setSpecKit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  useEffect(() => {
    if (!icon) {
      setIconPreview(null);
      return;
    }
    let cancelled = false;
    void getImageDataUrl(icon).then((url) => {
      if (!cancelled) {
        setIconPreview(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [icon]);

  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    );
  }, []);

  const handleBrowse = useCallback(() => {
    setShowFilePicker(true);
  }, []);

  const handleFilePickerSelect = useCallback((selectedPath: string) => {
    setShowFilePicker(false);
    setPath(selectedPath);
    if (!name) {
      const dirName = selectedPath.split(/[\\/]/).filter(Boolean).pop() ?? "";
      setName(dirName);
    }
  }, [name]);

  const pickIcon = useCallback(() => {
    setShowIconPicker(true);
  }, []);

  const handleIconPickerSelect = useCallback(async (selectedPath: string) => {
    setShowIconPicker(false);
    try {
      const res = await fetch(`${API_BASE}/api/fs/read-file-base64`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedPath }),
      });
      if (!res.ok) throw new Error("Failed to read image");
      const { data_url } = await res.json() as { data_url: string };
      setIcon(data_url);
    } catch {
      setIcon(selectedPath);
    }
  }, []);

  const clearIcon = useCallback(() => {
    setIcon(undefined);
  }, []);

  const handleFinish = useCallback(async () => {
    if (!name.trim() || !path.trim() || !onFinish) return;
    setSubmitting(true);

    const now = Date.now();
    const project: Project = {
      id: "", // filled by parent addProject
      name: name.trim(),
      path: path.trim(),
      color,
      category,
      icon,
      defaultAgents: selectedAgents,
      mcpServers: [],
      agencyAgent: projectDraft.agencyAgent,
      specKit: specKit ? { enabled: true, agentId: "codex" } : { enabled: false, agentId: null },
      createdAt: now,
      sortOrder: now,
    };

    onFinish(project);
    setSubmitting(false);
  }, [name, path, color, category, icon, selectedAgents, specKit, projectDraft.agencyAgent, onFinish]);

  const handleSkip = useCallback(() => {
    if (onFinish) {
      onFinish(null);
    }
  }, [onFinish]);

  const valid = name.trim() && path.trim();
  const installedAgentConfigs = KNOWN_AGENTS.filter((a) => installedAgents.includes(a.id));

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 md:p-8 transition-all duration-500 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.98)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="text-center max-w-xl shrink-0">
        <h2 className="font-headline font-black text-3xl md:text-4xl uppercase text-[#1a1a1a] dark:text-[#f5f0e8] tracking-tighter">
          Add Your First Project
        </h2>
        <p className="font-body text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-1">
          Nexus needs a working directory to run AI agents and monitor files
        </p>
      </div>

      <div className="w-full max-w-lg bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-6 flex flex-col gap-5 max-h-[65vh] overflow-y-auto shadow-[8px_8px_0px_0px_#1a1a1a] dark:shadow-[8px_8px_0px_0px_#f5f0e8]">
        {/* Name */}
        <div className="flex flex-col gap-2">
          <label className="font-headline font-black text-xs uppercase tracking-widest text-[#1a1a1a] dark:text-gray-400">
            Project Name
          </label>
          <input
            className="w-full bg-transparent border-b-3 border-[#1a1a1a] dark:border-[#333] p-2.5 font-mono text-sm text-[#1a1a1a] dark:text-[#f5f0e8] outline-none focus:border-[#ffcc00] dark:focus:border-[#ffcc00] placeholder-gray-400 dark:placeholder-gray-600 transition-colors"
            placeholder="e.g. My Awesome App"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={visible}
          />
        </div>

        {/* Path */}
        <div className="flex flex-col gap-2">
          <label className="font-headline font-black text-xs uppercase tracking-widest text-[#1a1a1a] dark:text-gray-400">
            Project Path
          </label>
          <div className="flex gap-3">
            <input
              className="flex-1 bg-transparent border-b-3 border-[#1a1a1a] dark:border-[#333] p-2.5 font-mono text-sm text-[#1a1a1a] dark:text-[#f5f0e8] outline-none focus:border-[#ffcc00] dark:focus:border-[#ffcc00] placeholder-gray-400 dark:placeholder-gray-600 transition-colors"
              placeholder="/path/to/project"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <button
              type="button"
              onClick={handleBrowse}
              className="shrink-0 bg-[#ffcc00] border-3 border-[#1a1a1a] dark:border-[#f5f0e8] px-4 py-2 font-headline font-black text-xs uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white dark:hover:bg-white dark:hover:text-[#1a1a1a] shadow-[3px_3px_0px_#1a1a1a] active:translate-x-0.5 active:translate-y-0.5 transition-all duration-150 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">folder_open</span>
            </button>
          </div>
        </div>

        {/* Icon Picker */}
        <div className="flex flex-col gap-2">
          <label className="font-headline font-black text-xs uppercase tracking-widest text-[#1a1a1a] dark:text-gray-400">
            Project Icon
          </label>
          <div className="flex items-center gap-4">
            <div
              className="flex items-center justify-center font-headline font-black text-lg border-3 border-[#1a1a1a] dark:border-[#f5f0e8] uppercase shrink-0"
              style={{
                width: 48,
                height: 48,
                borderRadius: 4,
                background: color ?? "#1a1a1a",
                color: "#fff",
                overflow: "hidden",
              }}
            >
              {iconPreview ? (
                <img src={iconPreview} alt="icon" className="w-full h-full object-cover" />
              ) : (
                (name || "PJ").substring(0, 2).toUpperCase()
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={pickIcon}
                className="bg-[#ffcc00] border-3 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] px-4 py-1.5 font-headline font-black uppercase text-xs shadow-[2px_2px_0px_#1a1a1a] hover:bg-[#1a1a1a] hover:text-white dark:hover:bg-white dark:hover:text-[#1a1a1a] transition-all cursor-pointer"
              >
                Pick Image
              </button>
              {icon && (
                <button
                  type="button"
                  onClick={clearIcon}
                  className="border-3 border-[#1a1a1a] dark:border-[#f5f0e8] px-4 py-1.5 font-headline font-black uppercase text-xs hover:bg-[#e63b2e] hover:text-white hover:border-[#e63b2e] transition-all cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Category */}
        <div className="flex flex-col gap-2">
          <label className="font-headline font-black text-xs uppercase tracking-widest text-[#1a1a1a] dark:text-gray-400">
            Category
          </label>
          <div className="grid grid-cols-3 gap-2">
            {PROJECT_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={`border-3 p-2 font-headline font-black text-2xs md:text-xs uppercase transition-colors cursor-pointer ${
                  category === cat.value
                    ? "border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#ffcc00] text-[#1a1a1a] shadow-[2px_2px_0px_#1a1a1a]"
                    : "border-[#1a1a1a] dark:border-[#333] text-gray-500 dark:text-gray-400 hover:border-[#ffcc00]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div className="flex flex-col gap-2">
          <label className="font-headline font-black text-xs uppercase tracking-widest text-[#1a1a1a] dark:text-gray-400">
            Accent Color
          </label>
          <div className="flex flex-wrap gap-3">
            {PROJECT_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                className={`w-9 h-9 border-3 transition-all cursor-pointer ${
                  color === swatch
                    ? "border-[#1a1a1a] dark:border-[#f5f0e8] scale-110 shadow-[3px_3px_0px_0px_#ffcc00]"
                    : "border-[#1a1a1a] dark:border-[#333] hover:scale-105"
                }`}
                style={{ background: swatch }}
              />
            ))}
          </div>
        </div>

        {/* Default Agents */}
        <div className="flex flex-col gap-2">
          <label className="font-headline font-black text-xs uppercase tracking-widest text-[#1a1a1a] dark:text-gray-400">
            Default Agents
            <span className="font-normal opacity-50 ml-1">— auto-launch on launch</span>
          </label>
          {installedAgentConfigs.length === 0 ? (
            <p className="font-mono text-xs text-gray-400 italic">
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
                    className={`flex items-center gap-2 border-3 p-2 transition-colors text-left cursor-pointer ${
                      selected
                        ? "border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#ffcc00]/15 text-[#1a1a1a] dark:text-white font-bold"
                        : "border-[#1a1a1a] dark:border-[#333] text-gray-500 hover:border-[#ffcc00]"
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0 animate-pulse"
                      style={{ background: agent.color }}
                    />
                    <span className="font-headline font-black text-2xs md:text-xs uppercase truncate">
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
        <div className="flex items-center justify-between border-t-3 border-[#1a1a1a] dark:border-[#333] pt-4 mt-1">
          <div>
            <span className="font-headline font-black text-xs uppercase text-[#1a1a1a] dark:text-gray-400">
              Spec Kit
            </span>
            <p className="font-mono text-[9px] text-gray-500 mt-0.5 leading-tight">
              Initialize .specify folder for structured, prompt-driven multi-agent AI flow
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSpecKit((v) => !v)}
            className={`relative h-6 w-12 border-3 border-[#1a1a1a] dark:border-[#f5f0e8] transition-colors cursor-pointer ${
              specKit ? "bg-[#0055ff] border-[#1a1a1a]" : "bg-transparent"
            }`}
          >
            <span
              className={`absolute top-0.5 h-3.5 w-3.5 bg-[#1a1a1a] dark:bg-[#f5f0e8] transition-all ${
                specKit ? "right-0.5 bg-white dark:bg-white" : "left-0.5"
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
        className="absolute right-6 top-1/2 -translate-y-1/2 z-10 w-14 h-14 border-4 border-[#10B981] bg-white dark:bg-[#1a1a1a] text-[#10B981] flex items-center justify-center hover:bg-[#10B981] hover:text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-[#10B981] shadow-[4px_4px_0px_#10B981] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
        aria-label="Finish setup"
        title="Finish setup"
      >
        <span className="material-symbols-outlined text-3xl font-black">check</span>
      </button>

      {hasExistingProjects && (
        <button
          type="button"
          onClick={handleSkip}
          className="absolute left-6 bottom-6 border-3 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#ffcc00] text-[#1a1a1a] px-4 py-2 font-headline font-black uppercase text-xs shadow-[3px_3px_0px_#1a1a1a] hover:bg-[#1a1a1a] hover:text-white dark:hover:bg-white dark:hover:text-[#1a1a1a] transition-all cursor-pointer z-10"
        >
          Skip Project Setup & Finish
        </button>
      )}

      {/* File Picker Dialog overlay */}
      {showFilePicker && (
        <FilePicker
          title="Select Project Folder"
          initialPath={path || "~"}
          onSelect={handleFilePickerSelect}
          onClose={() => setShowFilePicker(false)}
        />
      )}

      {showIconPicker && (
        <FilePicker
          title="Select Image"
          initialPath="~"
          allowFiles={true}
          allowedExtensions={["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"]}
          onSelect={handleIconPickerSelect}
          onClose={() => setShowIconPicker(false)}
        />
      )}
    </div>
  );
}
