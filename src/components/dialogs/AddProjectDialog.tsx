import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { KNOWN_AGENTS, PROJECT_SWATCHES } from "../../constants/agents";
import type { AddProjectDraft, AgentId } from "../../types";

interface AddProjectDialogProps {
  onClose: () => void;
  onSubmit: (draft: AddProjectDraft) => Promise<void>;
}

function getNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

export function AddProjectDialog({
  onClose,
  onSubmit,
}: AddProjectDialogProps) {
  const [draft, setDraft] = useState<AddProjectDraft>({
    name: "",
    path: "",
    color: PROJECT_SWATCHES[0],
    defaultAgents: ["claude-code", "codex"],
    mcpServers: [],
  });
  const [submitting, setSubmitting] = useState(false);

  const selectedAgentSet = useMemo(
    () => new Set(draft.defaultAgents),
    [draft.defaultAgents],
  );

  const pickDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select a project folder",
    });

    if (typeof selected !== "string") {
      return;
    }

    setDraft((current) => ({
      ...current,
      path: selected,
      name: current.name || getNameFromPath(selected),
    }));
  };

  const toggleAgent = (agentId: AgentId) => {
    setDraft((current) => {
      const hasAgent = current.defaultAgents.includes(agentId);
      return {
        ...current,
        defaultAgents: hasAgent
          ? current.defaultAgents.filter((id) => id !== agentId)
          : [...current.defaultAgents, agentId],
      };
    });
  };

  const submit = async () => {
    if (!draft.name.trim() || !draft.path.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        ...draft,
        name: draft.name.trim(),
        path: draft.path.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-['Space_Grotesk']" role="presentation" onClick={onClose}>
      <section
        className="w-full max-w-2xl bg-[#f5f0e8] dark:bg-[#1a1a1a] border-8 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#f5f0e8] flex flex-col shadow-[8px_8px_0px_0px_#1a1a1a] dark:shadow-[8px_8px_0px_0px_#f5f0e8]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-project-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a] p-4 flex justify-between items-center z-10 shrink-0">
          <h2 id="add-project-title" className="font-['Space_Grotesk'] font-bold uppercase text-2xl tracking-tighter">Add Project</h2>
          <button className="material-symbols-outlined hover:text-[#e63b2e]" onClick={onClose} type="button">
            close
          </button>
        </div>

        <div className="p-8 flex flex-col gap-6 overflow-y-auto max-h-[80vh] font-['Space_Grotesk'] shadow-inner">
          
          <div className="flex flex-col gap-2">
            <label className="uppercase font-black text-sm tracking-wider">Project Name</label>
            <input
              className="w-full bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-4 font-body font-bold text-lg outline-none focus:border-[#0055ff] transition-colors"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="e.g. Nexus Frontend"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="uppercase font-black text-sm tracking-wider">Project Path</label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-4 font-mono font-bold text-lg outline-none focus:border-[#0055ff] transition-colors"
                value={draft.path}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, path: event.target.value }))
                }
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

          <div className="flex flex-col gap-2 mt-4">
            <label className="uppercase font-black text-sm tracking-wider flex justify-between items-end">
              <span>Default Agents</span>
              <span className="text-xs opacity-50 font-normal">Auto-launch on open</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {KNOWN_AGENTS.map((agent) => {
                const selected = selectedAgentSet.has(agent.id);
                return (
                  <button
                    key={agent.id}
                    className={`flex items-center gap-2 border-4 p-3 transition-colors ${
                       selected 
                        ? "border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a]" 
                        : "border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#1a1a1a] hover:bg-[#ffcc00] dark:hover:bg-[#ffcc00] dark:hover:text-[#1a1a1a]"
                    }`}
                    onClick={() => toggleAgent(agent.id)}
                    type="button"
                  >
                    <span 
                      className="w-3 h-3 rounded-full border border-white dark:border-[#1a1a1a] shrink-0" 
                      style={{ background: agent.color, borderColor: selected ? "inherit" : "var(--tw-border-opacity)" }} 
                    />
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
