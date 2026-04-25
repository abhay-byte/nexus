import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TerminalTab, AgencyAgentProjectConfig } from "../../types";

export const KANBAN_TAB_ID = "__kanban__";

interface AgencyAgentOption {
  slug: string;
  name: string;
  category: string;
}

interface TerminalTabBarProps {
  tabs: TerminalTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  onSplitHorizontal?: () => void;
  onSplitVertical?: () => void;
  gitStatus?: { count: number; branch: string } | null;
  onOpenSearch?: () => void;
  onOpenGitDiff?: () => void;
  onOpenSettings?: () => void;
  onToggleProjectPanel?: () => void;
  onToggleResourceMonitor?: () => void;
  resourceMonitorActive?: boolean;
  agencyAgent?: AgencyAgentProjectConfig;
  onUpdateAgencyAgent?: (patch: Partial<AgencyAgentProjectConfig>) => void;
  onListAgencyAgents?: () => Promise<AgencyAgentOption[]>;
  onSyncProjectAgencyAgent?: (slug: string, enabled: boolean) => Promise<string>;
}

function AgencyBarDropdown({
  agencyAgent,
  onUpdateAgencyAgent,
  onListAgencyAgents,
  onSyncProjectAgencyAgent,
}: {
  agencyAgent?: AgencyAgentProjectConfig;
  onUpdateAgencyAgent?: (patch: Partial<AgencyAgentProjectConfig>) => void;
  onListAgencyAgents?: () => Promise<AgencyAgentOption[]>;
  onSyncProjectAgencyAgent?: (slug: string, enabled: boolean) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<AgencyAgentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const enabled = agencyAgent?.enabled ?? false;
  const currentSlug = agencyAgent?.selectedAgentSlug ?? "agents-orchestrator";

  const loadAgents = useCallback(async () => {
    if (!onListAgencyAgents || fetched) return;
    setLoading(true);
    try {
      const list = await onListAgencyAgents();
      setAgents(list);
      const cats = Array.from(new Set(list.map((a) => a.category))).sort();
      if (cats.length > 0) setActiveCategory(cats[0]);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [onListAgencyAgents, fetched]);

  const handleToggle = useCallback(async () => {
    const next = !enabled;
    onUpdateAgencyAgent?.({ enabled: next });
    if (onSyncProjectAgencyAgent) {
      setSyncing(true);
      try {
        await onSyncProjectAgencyAgent(currentSlug, next);
      } catch {
        /* ignore */
      } finally {
        setSyncing(false);
      }
    }
  }, [enabled, currentSlug, onUpdateAgencyAgent, onSyncProjectAgencyAgent]);

  const handleSelect = useCallback(async (slug: string) => {
    onUpdateAgencyAgent?.({ selectedAgentSlug: slug });
    setOpen(false);
    setSearch("");
    if (onSyncProjectAgencyAgent && enabled) {
      setSyncing(true);
      try {
        await onSyncProjectAgencyAgent(slug, true);
      } catch {
        /* ignore */
      } finally {
        setSyncing(false);
      }
    }
  }, [onUpdateAgencyAgent, onSyncProjectAgencyAgent, enabled]);

  const categories = useMemo(
    () => Array.from(new Set(agents.map((a) => a.category))).sort(),
    [agents],
  );

  const filteredAgents = useMemo(() => {
    let list = agents;
    if (activeCategory) {
      list = list.filter((a) => a.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q));
    }
    return list;
  }, [agents, activeCategory, search]);

  const currentName = agents.find((a) => a.slug === currentSlug)?.name ?? currentSlug;

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={syncing}
        className={`w-2 h-2 shrink-0 border border-[#888] ${enabled ? "bg-[#10B981]" : "bg-transparent hover:bg-[#666]"}`}
        title={enabled ? "Agency agent enabled" : "Agency agent disabled"}
      />
      <button
        type="button"
        onClick={() => {
          void loadAgents();
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] font-bold text-[#888] hover:text-[#ffcc00] hover:bg-[#252525] transition-colors border-none bg-transparent cursor-pointer max-w-[120px]"
        title="Select agency personality"
      >
        <span className="material-symbols-outlined text-[12px]" style={{ fontSize: "12px" }}>smart_toy</span>
        <span className="truncate">{currentName}</span>
        <span className="material-symbols-outlined text-[12px] shrink-0" style={{ fontSize: "12px" }}>expand_more</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-[200] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-[#f5f0e8] dark:bg-[#1a1a1a] shadow-[4px_4px_0px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_0px_#f5f0e8] min-w-[280px] max-w-[90vw] max-h-80 overflow-hidden flex flex-col">
          {!fetched && !loading && (
            <div className="p-3 font-mono text-[10px] text-[#555] dark:text-[#888]">
              <button
                type="button"
                onClick={() => void loadAgents()}
                className="w-full border-2 border-[#1a1a1a] dark:border-[#f5f0e8] px-2 py-1 font-mono text-[10px] text-[#1a1a1a] dark:text-[#ffcc00] hover:bg-[#ffcc00] dark:hover:bg-[#333] transition-none bg-transparent cursor-pointer"
              >
                Load Agency Catalog
              </button>
            </div>
          )}
          {loading && (
            <div className="p-3 font-mono text-[10px] text-[#555] dark:text-[#888] flex items-center gap-2">
              <span className="material-symbols-outlined text-xs animate-spin">sync</span>
              Loading…
            </div>
          )}
          {fetched && agents.length === 0 && (
            <div className="p-3 font-mono text-[10px] text-[#555] dark:text-[#888]">No agency agents found</div>
          )}

          {fetched && agents.length > 0 && (
            <>
              {/* Search */}
              <div className="p-2 border-b-2 border-[#1a1a1a] dark:border-[#f5f0e8]">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search agents…"
                  className="w-full bg-white dark:bg-[#0d0d0d] border-2 border-[#1a1a1a] dark:border-[#333] px-2 py-1 font-mono text-[10px] text-[#1a1a1a] dark:text-[#f5f0e8] placeholder:text-[#888] dark:placeholder:text-[#666] outline-none focus:border-[#ffcc00]"
                />
              </div>

              {/* Categories */}
              <div className="flex flex-wrap gap-1 p-2 border-b-2 border-[#1a1a1a] dark:border-[#f5f0e8]">
                <button
                  type="button"
                  onClick={() => setActiveCategory("")}
                  className={`px-2 py-0.5 font-mono text-[9px] font-bold uppercase border-2 transition-none cursor-pointer ${
                    activeCategory === ""
                      ? "border-[#ffcc00] bg-[#ffcc00] text-[#1a1a1a]"
                      : "border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#888] hover:border-[#ffcc00] hover:text-[#ffcc00] bg-transparent"
                  }`}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`px-2 py-0.5 font-mono text-[9px] font-bold uppercase border-2 transition-none cursor-pointer ${
                      activeCategory === cat
                        ? "border-[#ffcc00] bg-[#ffcc00] text-[#1a1a1a]"
                        : "border-[#1a1a1a] dark:border-[#f5f0e8] text-[#1a1a1a] dark:text-[#888] hover:border-[#ffcc00] hover:text-[#ffcc00] bg-transparent"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Agent list */}
              <div className="overflow-y-auto flex-1">
                {filteredAgents.length === 0 && (
                  <div className="p-3 font-mono text-[10px] text-[#555] dark:text-[#888]">No matches</div>
                )}
                {filteredAgents.map((agent) => (
                  <div
                    key={agent.slug}
                    onClick={() => void handleSelect(agent.slug)}
                    className={`flex items-center gap-2 px-3 py-2 font-mono text-[10px] cursor-pointer border-b-2 border-[#1a1a1a] dark:border-[#f5f0e8] last:border-b-0 transition-none ${
                      agent.slug === currentSlug
                        ? "bg-[#ffcc00] text-[#1a1a1a] font-black"
                        : "text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-[#ffcc00] hover:text-[#1a1a1a]"
                    }`}
                  >
                    {agent.slug === currentSlug && (
                      <span className="material-symbols-outlined text-[10px]">check</span>
                    )}
                    <span className="truncate">{agent.name}</span>
                    <span className="ml-auto shrink-0 opacity-50 text-[9px] uppercase">{agent.category}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function TerminalTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onSplitHorizontal,
  onSplitVertical,
  gitStatus,
  onOpenSearch,
  onOpenGitDiff,
  onOpenSettings,
  onToggleProjectPanel,
  onToggleResourceMonitor,
  resourceMonitorActive,
  agencyAgent,
  onUpdateAgencyAgent,
  onListAgencyAgents,
  onSyncProjectAgencyAgent,
}: TerminalTabBarProps) {
  const kanbanActive = activeTabId === KANBAN_TAB_ID;

  return (
    <div className="flex items-center bg-[#1a1a1a] dark:bg-[#0d0d0d] border-b-2 border-[#333] shrink-0">
      {/* Left: scrollable tabs area */}
      <div className="flex items-center overflow-x-auto scrollbar-none min-w-0">
        {/* Project panel toggle — before Kanban */}
        {onToggleProjectPanel && (
          <button
            className="flex items-center justify-center px-3 py-1.5 text-[#888] hover:text-[#ffcc00] hover:bg-[#252525] transition-colors shrink-0 border-none bg-transparent cursor-pointer"
            onClick={onToggleProjectPanel}
            title="Toggle project files"
            type="button"
          >
            <span className="material-symbols-outlined text-lg">folder_open</span>
          </button>
        )}

        <div className="w-px h-6 bg-[#444] mx-0.5 shrink-0" />

        {/* Fixed KANBAN tab */}
        <div
          className={`flex items-center gap-1.5 px-4 py-1.5 border-r-2 border-[#333] cursor-pointer shrink-0 transition-colors select-none ${
            kanbanActive
              ? "bg-[#ffcc00] text-[#1a1a1a] font-black"
              : "text-[#666] hover:bg-[#252525] hover:text-[#f5f0e8]"
          }`}
          onClick={() => onSelectTab(KANBAN_TAB_ID)}
        >
          <span className="text-[10px]">◈</span>
          <span className="font-['Space_Grotesk'] font-bold uppercase text-xs tracking-wide">
            Kanban
          </span>
        </div>

        {/* Divider between kanban and terminals */}
        <div className="w-px h-6 bg-[#444] mx-0.5 shrink-0" />

        {/* Terminal tabs */}
        {tabs.map((tab, i) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`flex items-center gap-1 px-3 py-1.5 border-r-2 border-[#333] cursor-pointer shrink-0 group transition-colors ${
                active
                  ? "bg-[#ffcc00] text-[#1a1a1a] font-black"
                  : "text-[#888] hover:bg-[#252525] hover:text-[#f5f0e8]"
              }`}
              onClick={() => onSelectTab(tab.id)}
            >
              <span className="font-['Space_Grotesk'] font-bold uppercase text-xs tracking-wide select-none">
                {tab.label || `Terminal ${i + 1}`}
              </span>
              {tabs.length > 1 && (
                <button
                  className={`ml-1 w-4 h-4 flex items-center justify-center text-xs font-black transition-colors opacity-0 group-hover:opacity-100 ${
                    active ? "hover:bg-[#1a1a1a] hover:text-[#ffcc00]" : "hover:bg-[#e63b2e] hover:text-white"
                  }`}
                  onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                  title="Close tab"
                  type="button"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* New terminal tab button */}
        <button
          className="flex items-center justify-center px-3 py-1.5 text-[#555] hover:text-[#ffcc00] hover:bg-[#252525] transition-colors shrink-0 font-black text-sm border-none bg-transparent cursor-pointer"
          onClick={onAddTab}
          title="New terminal tab"
          type="button"
        >
          +
        </button>
      </div>

      <div className="flex-1 min-w-0" />

      {/* Right: fixed action buttons (not scrollable, no overflow clipping) */}
      <div className="flex items-center shrink-0">
        {/* Agency Agent dropdown */}
        {onUpdateAgencyAgent && (
          <div className="flex items-center gap-1 px-2 border-l-2 border-[#333] shrink-0">
            <AgencyBarDropdown
              agencyAgent={agencyAgent}
              onUpdateAgencyAgent={onUpdateAgencyAgent}
              onListAgencyAgents={onListAgencyAgents}
              onSyncProjectAgencyAgent={onSyncProjectAgencyAgent}
            />
          </div>
        )}

        {/* Git branch */}
        {gitStatus && (
          <div className="flex items-center gap-1 px-2 border-l-2 border-[#333] shrink-0">
            <span className="font-mono text-[10px] font-bold uppercase text-[#888] max-w-[100px] truncate" title={gitStatus.branch}>
              {gitStatus.branch}
            </span>
          </div>
        )}

        {/* Action buttons merged from titlebar */}
        <div className="flex items-center gap-1 px-3 border-l-2 border-[#333] shrink-0">
          <button
            className="material-symbols-outlined cursor-pointer hover:text-[#ffcc00] disabled:opacity-30 bg-transparent border-none text-[#888] text-lg px-1"
            onClick={onOpenSearch}
            disabled={!onOpenSearch}
            title="Search logs"
            type="button"
          >
            search
          </button>
          <div className="relative">
            <button
              className="material-symbols-outlined cursor-pointer hover:text-[#ffcc00] disabled:opacity-30 bg-transparent border-none text-[#888] text-lg px-1"
              onClick={onOpenGitDiff}
              disabled={!onOpenGitDiff}
              title="Git diff"
              type="button"
            >
              account_tree
            </button>
            {gitStatus != null && gitStatus.count > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#e63b2e] text-white text-[10px] font-black w-4 h-4 flex items-center justify-center border-2 border-[#1a1a1a] pointer-events-none rounded-none rounded-tr-sm">
                {gitStatus.count > 9 ? "9+" : gitStatus.count}
              </span>
            )}
          </div>
          <button
            className="material-symbols-outlined cursor-pointer hover:text-[#ffcc00] disabled:opacity-30 bg-transparent border-none text-[#888] text-lg px-1"
            onClick={onOpenSettings}
            disabled={!onOpenSettings}
            title="Settings"
            type="button"
          >
            settings
          </button>
        </div>

        {/* Split controls */}
        <div className="flex items-center gap-1 px-3 border-l-2 border-[#333] shrink-0">
          <button
            className="material-symbols-outlined cursor-pointer hover:text-[#ffcc00] disabled:opacity-30 bg-transparent border-none text-[#888] text-lg px-1"
            onClick={onSplitHorizontal}
            disabled={!onSplitHorizontal}
            title="Horizontal split"
            type="button"
          >
            splitscreen_bottom
          </button>
          <button
            className="material-symbols-outlined cursor-pointer hover:text-[#ffcc00] disabled:opacity-30 bg-transparent border-none text-[#888] text-lg px-1"
            onClick={onSplitVertical}
            disabled={!onSplitVertical}
            title="Vertical split"
            type="button"
          >
            splitscreen_right
          </button>
        </div>

        {/* Resource monitor toggle */}
        {onToggleResourceMonitor && (
          <div className="flex items-center gap-1 px-3 border-l-2 border-[#333] shrink-0">
            <button
              className={`material-symbols-outlined cursor-pointer disabled:opacity-30 bg-transparent border-none text-lg px-1 ${
                resourceMonitorActive ? "text-[#ffcc00]" : "text-[#888] hover:text-[#ffcc00]"
              }`}
              onClick={onToggleResourceMonitor}
              title="Resource monitor"
              type="button"
            >
              bar_chart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
