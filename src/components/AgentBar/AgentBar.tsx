import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { KNOWN_AGENTS } from "../../constants/agents";
import type { AgentConfig, InstalledAgentStatus, Project, Session } from "../../types";

interface AgencyAgentOption {
  slug: string;
  name: string;
  category: string;
}

interface AgentBarProps {
  project: Project | null;
  sessions: Session[];
  installedAgents: InstalledAgentStatus[];
  customAgents: AgentConfig[];
  onLaunchAgent: (agentId: string) => void;
  onFocusAgent: (sessionId: string) => void;
  onSplit: (orientation: "horizontal" | "vertical") => void;
  onAddCustomAgent: () => void;
  onUpdateProject?: (projectId: string, patch: { agencyAgent: { enabled: boolean; selectedAgentSlug: string } }) => Promise<void>;
  onSyncProjectAgencyAgent?: (projectPath: string, slug: string, enabled: boolean) => Promise<string>;
}

// ─── Module-level cache (survives re-mounts, instant on 2nd open) ─────────────
let _agencyCache: AgencyAgentOption[] | null = null;
let _agencyFetching = false;
const _agencyListeners: Array<() => void> = [];

function subscribeFetch(cb: () => void) {
  _agencyListeners.push(cb);
  return () => {
    const i = _agencyListeners.indexOf(cb);
    if (i !== -1) _agencyListeners.splice(i, 1);
  };
}

function fetchAgencyAgentsGlobal(): Promise<AgencyAgentOption[]> {
  if (_agencyCache) return Promise.resolve(_agencyCache);
  if (_agencyFetching) {
    return new Promise((resolve) => {
      const off = subscribeFetch(() => {
        off();
        resolve(_agencyCache ?? []);
      });
    });
  }
  _agencyFetching = true;
  return invoke<AgencyAgentOption[]>("list_agency_agents")
    .then((entries) => {
      _agencyCache = entries;
      return entries;
    })
    .catch(() => {
      _agencyCache = [];
      return [] as AgencyAgentOption[];
    })
    .finally(() => {
      _agencyFetching = false;
      _agencyListeners.forEach((cb) => cb());
      _agencyListeners.length = 0;
    });
}

function invalidateAgencyCache() {
  _agencyCache = null;
}

// ─── Compact Agency Switcher ─────────────────────────────────────────────────

function AgencySwitcher({
  project,
  onUpdateProject,
  onSyncProjectAgencyAgent,
}: {
  project: Project;
  onUpdateProject?: AgentBarProps["onUpdateProject"];
  onSyncProjectAgencyAgent?: AgentBarProps["onSyncProjectAgencyAgent"];
}) {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<AgencyAgentOption[]>(_agencyCache ?? []);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(_agencyCache !== null);
  const [syncing, setSyncing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);

  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentSlug = project.agencyAgent?.selectedAgentSlug ?? "";

  // Close on outside click / scroll
  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const handleScroll = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const handleResize = () => setOpen(false);

    document.addEventListener("mousedown", handleOutsideClick, true);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick, true);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open]);

  const openDropdown = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(true);
  };

  const fetchAgents = () => {
    setLoading(true);
    void fetchAgencyAgentsGlobal().then((entries) => {
      setAgents(entries);
      setFetched(true);
      setLoading(false);
      setActiveCategory((c) => c || entries[0]?.category || "");
    });
  };

  const handleToggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    openDropdown();
    // Auto-fetch on first open
    if (!fetched && !_agencyFetching) {
      fetchAgents();
    } else if (!fetched && _agencyFetching) {
      setLoading(true);
      void fetchAgencyAgentsGlobal().then((entries) => {
        setAgents(entries);
        setFetched(true);
        setLoading(false);
        setActiveCategory((c) => c || entries[0]?.category || "");
      });
    }
  };

  const handleSelectSlug = async (slug: string) => {
    setOpen(false);
    if (!project.agencyAgent || slug === currentSlug) return;

    if (onUpdateProject) {
      await onUpdateProject(project.id, {
        agencyAgent: { enabled: true, selectedAgentSlug: slug },
      });
    }

    if (onSyncProjectAgencyAgent) {
      setSyncing(true);
      try {
        await onSyncProjectAgencyAgent(project.path, slug, true);
      } catch {
        // ignore — re-sync from settings
      } finally {
        setSyncing(false);
      }
    }
  };

  const categories = Array.from(new Set(agents.map((a) => a.category)));
  const visibleAgents = activeCategory
    ? agents.filter((a) => a.category === activeCategory)
    : agents;

  const currentAgent = agents.find((a) => a.slug === currentSlug);
  const displayName = currentAgent?.name
    ? currentAgent.name.length > 22 ? currentAgent.name.slice(0, 22) + "…" : currentAgent.name
    : currentSlug.length > 20 ? currentSlug.slice(0, 20) + "…" : currentSlug || "AGENCY";

  const dropdown = open && dropPos ? (
    <div
      ref={dropdownRef}
      style={{ position: "fixed", top: dropPos.top, right: dropPos.right, zIndex: 99999, width: 300 }}
      className="bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] shadow-[6px_6px_0px_0px_#1a1a1a] dark:shadow-[6px_6px_0px_0px_#f5f0e8] flex flex-col"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#0055ff] text-white flex items-center justify-between shrink-0">
        <div>
          <p className="font-['Space_Grotesk'] text-[9px] font-black uppercase tracking-[0.3em] opacity-80">
            Agency Specialist
          </p>
          <p className="font-['Space_Grotesk'] text-xs font-black uppercase leading-tight">
            {project.name}
          </p>
        </div>
        <span className="material-symbols-outlined text-base">groups</span>
      </div>

      {loading ? (
        <div className="px-4 py-5 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60 animate-pulse">
            Fetching catalog…
          </p>
          <p className="mt-1 font-body text-[10px] opacity-40">Shallow git clone in progress</p>
        </div>
      ) : !fetched ? (
        <div className="px-4 py-4 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60 mb-2">Requires network fetch</p>
          <button
            type="button"
            onClick={fetchAgents}
            className="border-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#0055ff] px-3 py-1.5 font-['Space_Grotesk'] text-[10px] font-black uppercase text-white hover:bg-[#1a1a1a]"
          >
            Load Catalog
          </button>
        </div>
      ) : agents.length === 0 ? (
        <div className="px-4 py-4 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">No agents found</p>
        </div>
      ) : (
        <>
          {/* Category tabs */}
          <div className="flex flex-wrap border-b-4 border-[#1a1a1a] dark:border-[#f5f0e8] shrink-0 p-1.5 gap-1.5 bg-[#f5f0e8] dark:bg-[#1a1a1a]">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-2 py-1 font-['Space_Grotesk'] text-[9px] font-black uppercase tracking-wider border-2 border-[#1a1a1a] dark:border-[#f5f0e8] ${
                  activeCategory === cat
                    ? "bg-[#ffcc00] text-[#1a1a1a]"
                    : "bg-white text-[#1a1a1a] dark:bg-[#111111] dark:text-[#f5f0e8] hover:bg-[#ffcc00] dark:hover:bg-[#ffcc00] hover:text-[#1a1a1a] dark:hover:text-[#1a1a1a]"
                }`}
              >
                {cat}
                <span className="ml-1 opacity-50">{agents.filter((a) => a.category === cat).length}</span>
              </button>
            ))}
          </div>

          {/* Specialist list */}
          <div className="overflow-y-auto max-h-[240px]">
            {visibleAgents.map((agent) => {
              const isCurrent = agent.slug === currentSlug;
              return (
                <button
                  key={agent.slug}
                  type="button"
                  onClick={() => void handleSelectSlug(agent.slug)}
                  className={`w-full text-left px-3 py-2 font-['Space_Grotesk'] text-xs font-bold uppercase border-b-2 border-[#1a1a1a] dark:border-[#f5f0e8] last:border-0 flex items-center justify-between gap-2 transition-none ${
                    isCurrent
                      ? "bg-[#0055ff] text-white"
                      : "text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-[#ffcc00] hover:text-[#1a1a1a]"
                  }`}
                >
                  <span className="truncate">{agent.name}</span>
                  {isCurrent ? (
                    <span className="material-symbols-outlined text-sm shrink-0">check_circle</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t-4 border-[#1a1a1a] dark:border-[#f5f0e8] px-3 py-1.5 flex items-center justify-between shrink-0">
            <p className="font-mono text-[9px] opacity-40 uppercase tracking-widest">
              {agents.length} specialists
            </p>
            <button
              type="button"
              onClick={() => {
                invalidateAgencyCache();
                setFetched(false);
                setAgents([]);
                fetchAgents();
              }}
              className="font-['Space_Grotesk'] text-[9px] font-black uppercase text-[#0055ff] hover:opacity-70 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Refresh
            </button>
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        title={`Agency Agent: ${currentSlug}${syncing ? " (syncing…)" : ""}`}
        className={`flex items-center gap-1.5 border-2 px-2 py-1 font-['Space_Grotesk'] text-[10px] font-black uppercase tracking-wider transition-none ${
          open
            ? "border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#1a1a1a] dark:bg-[#f5f0e8] text-white dark:text-[#1a1a1a]"
            : "border-[#1a1a1a] dark:border-[#f5f0e8] bg-transparent text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-[#ffcc00] dark:hover:bg-[#ffcc00] hover:text-[#1a1a1a] dark:hover:text-[#1a1a1a]"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full border border-current shrink-0 ${
            syncing ? "animate-pulse bg-[#ffcc00]" : "bg-current"
          }`}
        />
        {syncing ? "SYNCING" : displayName}
        <span
          className="material-symbols-outlined text-[12px] leading-none"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
      </button>
      {createPortal(dropdown, document.body)}
    </>
  );
}

// ─── AgentBar ────────────────────────────────────────────────────────────────

export function AgentBar({
  project,
  sessions,
  installedAgents,
  customAgents,
  onLaunchAgent,
  onFocusAgent,
  onSplit,
  onAddCustomAgent,
  onUpdateProject,
  onSyncProjectAgencyAgent,
}: AgentBarProps) {
  const [expanded, setExpanded] = useState(false);

  const installedSet = new Set(
    installedAgents.filter((agent) => agent.installed).map((agent) => agent.id),
  );
  const detectionFailed = installedAgents.length > 0 && installedSet.size === 0;
  const allAgents = [...KNOWN_AGENTS, ...customAgents];
  const activeSessions = sessions.filter(
    (session) => session.status === "running" || session.status === "starting",
  );
  const agentForId = (agentId: string) => allAgents.find((a) => a.id === agentId) ?? null;
  const agencyEnabled = project?.agencyAgent?.enabled === true;

  return (
    <section className="flex justify-between items-center bg-[#f5f0e8] dark:bg-[#121212] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#f5f0e8] p-2 neo-shadow dark:shadow-[4px_4px_0px_0px_#f5f0e8] shrink-0 relative">
      {/* Running session tabs */}
      <div className="flex gap-2 font-['Space_Grotesk'] uppercase font-bold text-sm flex-wrap items-center min-w-0">
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
                  className="w-2 h-2 rounded-full border border-[#1a1a1a] shrink-0"
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
            onClick={() => setExpanded((v) => !v)}
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
                    onClick={() => { setExpanded(false); onLaunchAgent(agent.id); }}
                    type="button"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0 border border-[#1a1a1a]" style={{ background: agent.color }} />
                    {agent.name}
                  </button>
                ))}
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
                onClick={() => { setExpanded(false); onAddCustomAgent(); }}
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

      {/* Right side: Agency switcher + split controls */}
      <div className="flex gap-2 p-1 text-[#1a1a1a] dark:text-[#f5f0e8] items-center shrink-0">
        {agencyEnabled && project ? (
          <AgencySwitcher
            project={project}
            onUpdateProject={onUpdateProject}
            onSyncProjectAgencyAgent={onSyncProjectAgencyAgent}
          />
        ) : null}

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
