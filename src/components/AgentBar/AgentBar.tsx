import { useState } from "react";
import { KNOWN_AGENTS } from "../../constants/agents";
import type { AgentConfig, InstalledAgentStatus, Project, Session } from "../../types";

interface AgentBarProps {
  project: Project | null;
  sessions: Session[];
  installedAgents: InstalledAgentStatus[];
  customAgents: AgentConfig[];
  onLaunchAgent: (agentId: string) => void;
  onFocusAgent: (sessionId: string) => void;
  onSplit: (orientation: "horizontal" | "vertical") => void;
  onAddCustomAgent: () => void;
}

export function AgentBar({
  project,
  sessions,
  installedAgents,
  customAgents,
  onLaunchAgent,
  onFocusAgent,
  onSplit,
  onAddCustomAgent,
}: AgentBarProps) {
  const [expanded, setExpanded] = useState(false);

  const installedSet = new Set(
    installedAgents.filter((agent) => agent.installed).map((agent) => agent.id),
  );
  // If detection returned 0 installed (Tauri PATH is limited), treat all as launchable.
  const detectionFailed = installedAgents.length > 0 && installedSet.size === 0;

  const allAgents = [...KNOWN_AGENTS, ...customAgents];

  // Running / starting sessions shown as tabs
  const activeSessions = sessions.filter(
    (session) => session.status === "running" || session.status === "starting",
  );

  const agentForId = (agentId: string) =>
    allAgents.find((a) => a.id === agentId) ?? null;

  return (
    <section className="flex justify-between items-center bg-[#f5f0e8] dark:bg-[#121212] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#f5f0e8] p-2 neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8] shrink-0 relative">
      {/* Running session tabs */}
      <div className="flex gap-2 font-['Space_Grotesk'] uppercase font-bold text-sm flex-wrap items-center">
        {activeSessions.length === 0 ? (
          <span className="opacity-40 text-xs font-['Space_Grotesk'] px-1">No active terminals</span>
        ) : (
          activeSessions.map((session) => {
            const agent = agentForId(session.agentId);
            return (
              <button
                key={session.id}
                className="flex items-center gap-2 border-2 border-[#1a1a1a] dark:border-[#f5f0e8] px-3 py-1 bg-[#ffcc00] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#ffcc00] dark:bg-[#ffcc00] dark:text-[#1a1a1a] dark:hover:bg-[#f5f0e8] dark:hover:text-[#1a1a1a] transition-colors"
                onClick={() => onFocusAgent(session.id)}
                title={`Focus ${agent?.name ?? session.agentId} terminal`}
                type="button"
              >
                <span
                  className="w-2 h-2 rounded-full border border-[#1a1a1a] shrink-0 animate-pulse"
                  style={{ background: agent?.color ?? "#ffcc00" }}
                />
                {agent?.name ?? session.agentId}
              </button>
            );
          })
        )}

        {/* + AGENT launch dropdown */}
        <div className="relative">
          <button
            className="flex items-center gap-1 bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a] border-2 border-[#1a1a1a] dark:border-[#f5f0e8] px-3 py-1 hover:bg-[#0055ff] dark:hover:bg-[#0055ff] dark:hover:text-white transition-none disabled:opacity-50"
            disabled={!project}
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            <span className="material-symbols-outlined text-sm">add</span> AGENT
          </button>
          {expanded && project ? (
            <div className="absolute top-full left-0 mt-2 min-w-[220px] bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-2 flex flex-col z-[100] shadow-[8px_8px_0px_0px_#1a1a1a] dark:shadow-[8px_8px_0px_0px_#f5f0e8] max-h-[360px] overflow-y-auto">
              {allAgents
                .filter((agent) => detectionFailed || agent.id.startsWith("custom-") || installedSet.has(agent.id))
                .map((agent) => (
                  <button
                    className="w-full text-left font-['Space_Grotesk'] font-bold uppercase px-4 py-2 hover:bg-[#ffcc00] dark:hover:bg-[#ffcc00] hover:text-[#1a1a1a] dark:hover:text-[#1a1a1a] border-2 border-transparent hover:border-[#1a1a1a] dark:hover:border-[#f5f0e8] flex gap-2 items-center text-[#1a1a1a] dark:text-[#f5f0e8]"
                    key={agent.id}
                    onClick={() => {
                      setExpanded(false);
                      onLaunchAgent(agent.id);
                    }}
                    type="button"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0 border border-[#1a1a1a]" style={{ background: agent.color }} />
                    {agent.name}
                  </button>
                ))}
              {/* Show ALL agents if detection failed (as fallback, greyed label) */}
              {!detectionFailed && allAgents.filter((a) => !a.id.startsWith("custom-") && !installedSet.has(a.id)).length > 0 && (
                <>
                  <div className="h-0.5 w-full bg-[#1a1a1a] dark:bg-[#f5f0e8] my-2 opacity-30" />
                  <div className="px-4 py-1 text-[10px] text-gray-400 font-body normal-case">Not found on PATH</div>
                  {allAgents
                    .filter((a) => !a.id.startsWith("custom-") && !installedSet.has(a.id))
                    .map((agent) => (
                      <button
                        className="w-full text-left font-['Space_Grotesk'] font-bold uppercase px-4 py-2 opacity-40 cursor-not-allowed flex gap-2 items-center text-[#1a1a1a] dark:text-[#f5f0e8]"
                        key={agent.id}
                        disabled
                        type="button"
                        title={`${agent.command} not found on PATH`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0 border border-[#1a1a1a]" style={{ background: agent.color }} />
                        {agent.name}
                      </button>
                    ))}
                </>
              )}
              <div className="h-0.5 w-full bg-[#1a1a1a] dark:bg-[#f5f0e8] my-2" />
              <button
                className="w-full text-left font-['Space_Grotesk'] font-bold uppercase px-4 py-2 text-[#0055ff] hover:bg-[#0055ff] hover:text-white border-2 border-transparent hover:border-[#1a1a1a]"
                onClick={() => {
                  setExpanded(false);
                  onAddCustomAgent();
                }}
                type="button"
              >
                + Custom agent...
              </button>
              <div className="px-4 py-2 text-[10px] text-gray-500 font-body normal-case">
                Known agents are auto-detected on PATH.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Split controls — right side */}
      <div className="flex gap-3 p-1 text-[#1a1a1a] dark:text-[#f5f0e8] items-center shrink-0">
        <button
          className="material-symbols-outlined cursor-pointer hover:text-[#0055ff] disabled:opacity-30 bg-transparent border-none"
          onClick={() => onSplit("horizontal")}
          disabled={!project}
          title="Horizontal split (cycle 1→2→3→4→1)"
          type="button"
        >
          splitscreen_bottom
        </button>
        <button
          className="material-symbols-outlined cursor-pointer hover:text-[#0055ff] disabled:opacity-30 bg-transparent border-none"
          onClick={() => onSplit("vertical")}
          disabled={!project}
          title="Vertical split (cycle 1→2→3→4→1)"
          type="button"
        >
          splitscreen_right
        </button>
      </div>
    </section>
  );
}
