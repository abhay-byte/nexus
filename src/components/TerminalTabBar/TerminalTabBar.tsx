import type { TerminalTab } from "../../types";

export const KANBAN_TAB_ID = "__kanban__";

interface TerminalTabBarProps {
  tabs: TerminalTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  onSplitHorizontal?: () => void;
  onSplitVertical?: () => void;
}

export function TerminalTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onSplitHorizontal,
  onSplitVertical,
}: TerminalTabBarProps) {
  const kanbanActive = activeTabId === KANBAN_TAB_ID;

  return (
    <div className="flex items-center bg-[#1a1a1a] dark:bg-[#0d0d0d] border-b-2 border-[#333] shrink-0 overflow-x-auto scrollbar-none">
      {/* Fixed KANBAN tab — always first */}
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

      <div className="flex-1 min-w-0" />

      {/* Split controls */}
      <div className="flex items-center gap-1 px-2 border-l-2 border-[#333] shrink-0">
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
    </div>
  );
}
