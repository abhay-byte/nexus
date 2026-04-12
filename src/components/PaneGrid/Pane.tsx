import { KNOWN_AGENTS } from "../../constants/agents";
import { useSessionStore } from "../../store/sessionStore";
import type { AgentConfig, Pane as PaneType, Project, Session } from "../../types";
import { TerminalView } from "./TerminalView";

interface PaneProps {
  pane: PaneType;
  project: Project;
  active: boolean;
  attention: boolean;
  session: Session | null;
  customAgents: AgentConfig[];
  isTabActive: boolean;
  onFocus: () => void;
  onLaunchAgent: (agentId: string, paneId: string) => void;
}

export function Pane({
  pane,
  project,
  active,
  attention,
  session,
  customAgents,
  isTabActive,
  onFocus,
  onLaunchAgent,
}: PaneProps) {
  const settings = useSessionStore((state) => state.settings);
  const killSession = useSessionStore((state) => state.killSession);
  const restartSession = useSessionStore((state) => state.restartSession);
  const exportSessionLog = useSessionStore((state) => state.exportSessionLog);
  const installedAgents = useSessionStore((state) => state.installedAgents);
  const installedSet = new Set(
    installedAgents.filter((agent) => agent.installed).map((agent) => agent.id),
  );

  const visibleAgents = [...KNOWN_AGENTS, ...customAgents];
  const agent = session
    ? visibleAgents.find((entry) => entry.id === session.agentId) ?? null
    : null;

  return (
    <section
      className={`flex-1 min-h-0 bg-white dark:bg-[#121212] border-4 flex flex-col neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8] group relative overflow-hidden transition-all ${
        active ? "border-[#ffcc00]" : "border-[#1a1a1a] dark:border-[#f5f0e8]"
      } ${attention ? "border-[#ffcc00]" : ""}`}
      onClick={onFocus}
    >
      <header className={`bg-[#f5f0e8] dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8] border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] px-3 py-1 flex justify-between items-center z-10 font-['Space_Grotesk'] uppercase font-bold text-xs shrink-0 ${active && !session ? "bg-[#ffcc00] dark:bg-[#ffcc00] !text-[#1a1a1a]" : ""}`}>
        <div className="flex items-center gap-2 overflow-hidden">
          <span 
            className="border-2 border-[#1a1a1a] dark:border-transparent px-2 py-0.5 shrink-0"
            style={{ backgroundColor: agent?.color ?? "transparent", color: agent ? "#1a1a1a" : "inherit" }}
          >
            {agent?.name ?? "Empty"}
          </span>
          <span className="opacity-50 lowercase tracking-widest font-mono truncate">{session?.cwd ?? project.path}</span>
        </div>
        {session ? (
          <div className="flex gap-2 shrink-0">
            <span
              className="material-symbols-outlined text-sm cursor-pointer hover:text-[#0055ff]"
              onClick={(event) => {
                event.stopPropagation();
                void exportSessionLog(session.id);
              }}
              title="Export log"
            >
              download
            </span>
            <span
              className="material-symbols-outlined text-sm cursor-pointer hover:text-[#0055ff]"
              onClick={(event) => {
                event.stopPropagation();
                void restartSession(session.id);
              }}
              title="Restart"
            >
              refresh
            </span>
            <span
              className="material-symbols-outlined text-sm cursor-pointer hover:text-[#e63b2e]"
              onClick={(event) => {
                event.stopPropagation();
                void killSession(project.id, session.id);
              }}
              title="Kill"
            >
              close
            </span>
          </div>
        ) : null}
      </header>

      <div className="flex-1 relative overflow-hidden bg-[#1a1a1a]">
        {session ? (
          <div className="absolute inset-0 p-1">
            <TerminalView
              session={session}
              paneId={pane.id}
              fontFamily={settings.fontFamily}
              fontSize={settings.fontSize}
              scrollback={settings.scrollback}
              cursorStyle={settings.cursorStyle}
              cursorBlink={settings.cursorBlink}
              isTabActive={isTabActive}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center h-full bg-[#f5f0e8] dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#f5f0e8]">
            <p className="font-['Space_Grotesk'] font-bold text-xl mb-6">Which agent should run here?</p>
            <div className="flex flex-wrap gap-4 justify-center max-w-lg">
              {(() => {
                // If installedSet is empty (detection failed), show all agents as fallback
                const filtered = visibleAgents.filter(
                  (entry) => entry.id.startsWith("custom-") || installedSet.has(entry.id)
                );
                const agentsToShow = filtered.length > 0 ? filtered : visibleAgents;
                return agentsToShow.map((entry) => (
                <button
                  className="bg-white dark:bg-[#1a1a1a] border-2 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#f5f0e8] px-4 py-2 font-['Space_Grotesk'] font-black uppercase neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8] hover:translate-x-[2px] transition-all flex items-center gap-2 hover:bg-[#eee9e0] dark:hover:bg-[#2a2a2a]"
                  key={entry.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onLaunchAgent(entry.id, pane.id);
                  }}
                  type="button"
                >
                  <span
                    className="w-3 h-3 rounded-full border border-[#1a1a1a] dark:border-[#f5f0e8] shrink-0"
                    style={{ background: entry.color }}
                  />
                  {entry.name}
                </button>
              ));
              })()}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
