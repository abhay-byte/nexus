import { useEffect, useRef, useState } from "react";

interface FeatureSlide {
  icon: string;
  title: string;
  description: string;
}

const FEATURES: FeatureSlide[] = [
  {
    icon: "smart_toy",
    title: "Multi-Agent Runner",
    description:
      "Run Claude Code, Codex CLI, Gemini CLI, Aider, Qwen, OpenCode, Kiro, and more — side-by-side in split panes. Each agent gets its own real PTY terminal with full shell environment inheritance.",
  },
  {
    icon: "view_quilt",
    title: "Split Panes",
    description:
      "Split terminals horizontally or vertically in a 2×2 grid. Resize panels freely with draggable dividers. Every pane can run a different AI agent or a plain shell — pick what each pane does.",
  },
  {
    icon: "view_kanban",
    title: "Kanban Boards",
    description:
      "Built-in Kanban tab per project with Todo, In Progress, Done, and Blocked columns. Create, edit, drag-and-drop, and delete tasks. Everything persists across restarts so your workflow stays intact.",
  },
  {
    icon: "cloud_sync",
    title: "Planka Cloud Sync",
    description:
      "Connect to a self-hosted Planka instance for team kanban with live syncing. Full CRUD — create projects, boards, lists, and cards. Drag-and-drop cards between lists syncs instantly to your Planka server via WebSocket.",
  },
  {
    icon: "difference",
    title: "Git Diff Panel",
    description:
      "Full side-by-side diff viewer with line numbers and color-coded additions/removals. Switch branches from a dropdown. See changed file count on the toolbar button. Generate commit instructions for your AI agent in one click.",
  },
  {
    icon: "folder_open",
    title: "File Explorer",
    description:
      "Browse your project's file tree with lazy-loaded directories. Preview images, animated GIFs, and text files directly in the app. Drag any file from the tree onto a terminal to paste its path — perfect for telling agents which file to work on.",
  },
  {
    icon: "psychology",
    title: "AI Agency Personalities",
    description:
      "Assign specialist agent personalities to your projects from a catalog of 65+ agents across Engineering, Design, Marketing, QA, and more. Each personality writes an AGENCY.md instruction file that all agents in the project follow.",
  },
  {
    icon: "hub",
    title: "MCP Servers & Skills",
    description:
      "One-click setup for MCP servers like context7, playwright, github, filesystem, and more. Configure once in Settings, sync across all projects. Nexus auto-generates the correct MCP config file for each agent — Claude Code, Gemini CLI, Codex, OpenCode, and others.",
  },
];

function FeaturePlaceholder({ index }: { index: number }) {
  // Render a mock design for each feature
  switch (index) {
    case 0: // Multi-Agent Runner
      return (
        <div className="flex flex-col h-full bg-[#1e1e1e] text-white p-3 font-mono text-[11px] leading-tight select-none">
          {/* Header */}
          <div className="flex items-center gap-1.5 pb-2 border-b border-[#333] mb-2 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-2 text-[#666] text-[9px] uppercase tracking-wider">claude-agent@nexus</span>
          </div>
          {/* Output lines */}
          <div className="flex-1 space-y-1.5 overflow-hidden">
            <div className="text-[#888]">$ agy run "implement auth flow"</div>
            <div className="text-[#ffcc00] flex items-center gap-1">
              <span className="animate-pulse">●</span> Spawning Claude Code in workspace...
            </div>
            <div className="text-blue-400">ℹ Using 4 MCP tools (context7, git, fs, web)</div>
            <div className="text-green-400">✓ Detected project structure successfully</div>
            <div className="text-[#888]">Analyzing src/auth/jwt.ts...</div>
            <div className="bg-[#2a2a2a] p-1.5 border border-[#444] text-[10px] text-white flex flex-col gap-0.5 mt-1">
              <span className="text-[#ff5f56]">- export function verify() {"{}"}</span>
              <span className="text-[#27c93f]">+ export function verify(token: string) {"{"}</span>
              <span className="text-[#27c93f]">+   return jwt.verify(token, SECRET);</span>
              <span className="text-[#27c93f]">+ {"}"}</span>
            </div>
            <div className="text-[#ffcc00] animate-bounce mt-1">▲ Claude: Applying modifications...</div>
          </div>
        </div>
      );
    case 1: // Split Panes
      return (
        <div className="grid grid-cols-2 grid-rows-2 h-full bg-[#111] p-1 gap-1 select-none">
          <div className="border border-dashed border-[#ffcc00] bg-[#1a1a1a] p-2 flex flex-col justify-between font-mono text-[9px]">
            <span className="text-[#ffcc00] uppercase font-bold text-[8px]">Pane 1: claude-code</span>
            <span className="text-gray-500">$ agy run tests</span>
            <span className="text-green-500 font-bold">PASS 12/12</span>
          </div>
          <div className="border border-dashed border-blue-400 bg-[#1a1a1a] p-2 flex flex-col justify-between font-mono text-[9px]">
            <span className="text-blue-400 uppercase font-bold text-[8px]">Pane 2: gemini-cli</span>
            <span className="text-gray-500">$ query docs</span>
            <span className="text-blue-300">Searching context7...</span>
          </div>
          <div className="border border-dashed border-[#e63b2e] bg-[#1a1a1a] p-2 flex flex-col justify-between font-mono text-[9px]">
            <span className="text-[#e63b2e] uppercase font-bold text-[8px]">Pane 3: bash-terminal</span>
            <span className="text-gray-500">$ npm run dev</span>
            <span className="text-yellow-500">Port 5173 active</span>
          </div>
          <div className="border border-[#333] bg-[#0d0d0d] flex items-center justify-center text-gray-600 font-bold text-[10px] hover:bg-[#ffcc00]/10 hover:text-[#ffcc00] cursor-pointer transition-colors">
            + SPLIT
          </div>
        </div>
      );
    case 2: // Kanban Boards
      return (
        <div className="flex h-full bg-[#f5f0e8] dark:bg-[#151515] p-2 gap-2 select-none text-[10px]">
          {/* Todo Column */}
          <div className="flex-1 flex flex-col border-2 border-[#1a1a1a] dark:border-[#333] bg-[#fff] dark:bg-[#1e1e1e] p-1.5">
            <span className="font-headline font-black uppercase text-[#e63b2e] border-b border-[#1a1a1a] dark:border-[#333] pb-1 mb-1.5 text-[8px]">Todo</span>
            <div className="border border-[#1a1a1a] dark:border-[#444] bg-[#f5f0e8] dark:bg-[#2a2a2a] p-1 mb-1 font-headline font-bold text-[8px]">Setup Planka Sync</div>
            <div className="border border-[#1a1a1a] dark:border-[#444] bg-[#f5f0e8] dark:bg-[#2a2a2a] p-1 font-headline font-bold text-[8px]">Add CLI params</div>
          </div>
          {/* In Progress */}
          <div className="flex-1 flex flex-col border-2 border-[#1a1a1a] dark:border-[#333] bg-[#fff] dark:bg-[#1e1e1e] p-1.5">
            <span className="font-headline font-black uppercase text-[#ffcc00] border-b border-[#1a1a1a] dark:border-[#333] pb-1 mb-1.5 text-[8px]">Working</span>
            <div className="border-2 border-[#1a1a1a] bg-[#ffcc00] text-[#1a1a1a] p-1 font-headline font-black text-[8px] rotate-1">Theme switching</div>
          </div>
          {/* Done */}
          <div className="flex-1 flex flex-col border-2 border-[#1a1a1a] dark:border-[#333] bg-[#fff] dark:bg-[#1e1e1e] p-1.5">
            <span className="font-headline font-black uppercase text-green-500 border-b border-[#1a1a1a] dark:border-[#333] pb-1 mb-1.5 text-[8px]">Done</span>
            <div className="border border-[#1a1a1a] dark:border-[#444] bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 p-1 line-through font-headline font-bold text-[8px]">Init onboarding</div>
          </div>
        </div>
      );
    case 3: // Planka Cloud Sync
      return (
        <div className="flex flex-col items-center justify-center h-full bg-[#f5f0e8] dark:bg-[#111] p-4 text-center font-headline relative select-none">
          <div className="flex items-center gap-6">
            <div className="border-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#222] p-2 flex flex-col items-center shadow-[3px_3px_0px_#1a1a1a]">
              <span className="material-symbols-outlined text-xl text-[#ffcc00]">view_kanban</span>
              <span className="text-[7px] font-black uppercase mt-1">Local UI</span>
            </div>
            <div className="flex flex-col items-center relative gap-0.5">
              <span className="material-symbols-outlined text-[#0055ff] animate-[spin_4s_linear_infinite]">sync</span>
              <span className="text-[7px] text-blue-500 font-bold uppercase font-mono tracking-widest animate-pulse">Websocket</span>
            </div>
            <div className="border-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#222] p-2 flex flex-col items-center shadow-[3px_3px_0px_#1a1a1a]">
              <span className="material-symbols-outlined text-xl text-blue-500">cloud</span>
              <span className="text-[7px] font-black uppercase mt-1">Planka.io</span>
            </div>
          </div>
          <div className="mt-4 border-2 border-dashed border-[#e63b2e] bg-[#e63b2e]/10 text-[#e63b2e] font-mono text-[8px] uppercase font-bold p-1 px-3">
            Realtime bidirectional sync
          </div>
        </div>
      );
    case 4: // Git Diff Panel
      return (
        <div className="flex flex-col h-full bg-[#1e1e1e] text-white p-3 font-mono text-[9px] select-none">
          <div className="flex justify-between items-center bg-[#252525] p-1.5 border border-[#333] mb-2 shrink-0">
            <span className="text-gray-400">git diff (src/App.tsx)</span>
            <span className="text-green-400">+56 -12</span>
          </div>
          <div className="flex-1 overflow-hidden space-y-1.5">
            <div className="text-gray-500">@@ -150,8 +150,11 @@</div>
            <div className="bg-red-950/40 text-red-300 p-1 flex items-center">
              <span className="text-red-500 mr-2">-</span>
              <span>const theme = localStorage.getItem("theme");</span>
            </div>
            <div className="bg-green-950/40 text-green-300 p-1 flex flex-col">
              <div className="flex items-center">
                <span className="text-green-500 mr-2">+</span>
                <span>const theme = useSessionStore(state =&gt; state.settings.theme);</span>
              </div>
              <div className="flex items-center">
                <span className="text-green-500 mr-2">+</span>
                <span>useEffect(() =&gt; updateTheme(theme), [theme]);</span>
              </div>
            </div>
          </div>
        </div>
      );
    case 5: // File Explorer
      return (
        <div className="flex flex-col h-full bg-[#f5f0e8] dark:bg-[#161616] p-3 text-[10px] select-none border-2 border-[#1a1a1a] dark:border-[#333]">
          <div className="font-headline font-black uppercase text-[#1a1a1a] dark:text-[#ffcc00] border-b border-[#1a1a1a] dark:border-[#333] pb-1 mb-2">Workspace Explorer</div>
          <div className="flex-1 font-mono space-y-1 text-gray-700 dark:text-gray-300">
            <div className="flex items-center gap-1.5 text-yellow-600 dark:text-[#ffcc00]">
              <span className="material-symbols-outlined text-[12px]">folder_open</span>
              <span>src</span>
            </div>
            <div className="pl-4 flex items-center gap-1.5 text-yellow-600 dark:text-[#ffcc00]">
              <span className="material-symbols-outlined text-[12px]">folder</span>
              <span>components</span>
            </div>
            <div className="pl-8 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[12px] text-blue-500">javascript</span>
              <span className="font-bold text-[#1a1a1a] dark:text-white">App.tsx</span>
            </div>
            <div className="pl-8 flex items-center gap-1.5 opacity-60">
              <span className="material-symbols-outlined text-[12px]">javascript</span>
              <span>Sidebar.tsx</span>
            </div>
            <div className="pl-4 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[12px] text-purple-500">description</span>
              <span>README.md</span>
            </div>
          </div>
        </div>
      );
    case 6: // AI Agency Personalities
      return (
        <div className="flex flex-col items-center justify-center h-full bg-[#f5f0e8] dark:bg-[#1a1a1a] p-4 font-headline relative select-none overflow-hidden">
          <div className="absolute top-4 left-6 border-4 border-[#1a1a1a] bg-blue-500 text-white p-2 text-[9px] font-black uppercase rotate-3 shadow-[3px_3px_0px_#1a1a1a]">
            DESIGNER.md
          </div>
          <div className="absolute bottom-4 right-6 border-4 border-[#1a1a1a] bg-[#e63b2e] text-white p-2 text-[9px] font-black uppercase -rotate-6 shadow-[3px_3px_0px_#1a1a1a]">
            QA_TESTER.md
          </div>
          <div className="border-4 border-[#1a1a1a] bg-[#ffcc00] text-[#1a1a1a] p-3 text-[10px] font-black uppercase relative z-10 shadow-[4px_4px_0px_#1a1a1a] text-center max-w-[180px]">
            <span className="material-symbols-outlined text-lg mb-1">psychology</span>
            <div>Orchestrator</div>
            <div className="text-[7px] font-bold text-gray-700 mt-1">Writes AGENCY.md rules</div>
          </div>
        </div>
      );
    case 7: // MCP Servers & Skills
      return (
        <div className="flex flex-col items-center justify-center h-full bg-[#f5f0e8] dark:bg-[#111] p-3 relative font-headline select-none text-[9px]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#ffcc00] text-[#1a1a1a] border-2 border-[#1a1a1a] font-black p-1.5 z-10 shadow-[2px_2px_0px_#1a1a1a]">
            NEXUS
          </div>
          <svg className="absolute inset-0 w-full h-full text-[#1a1a1a] dark:text-[#555]" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3">
            <line x1="20%" y1="20%" x2="50%" y2="50%" />
            <line x1="80%" y1="20%" x2="50%" y2="50%" />
            <line x1="20%" y1="80%" x2="50%" y2="50%" />
            <line x1="80%" y1="80%" x2="50%" y2="50%" />
          </svg>
          <div className="absolute top-3 left-4 border border-[#1a1a1a] bg-white dark:bg-[#222] p-1 font-bold">
            Playwright
          </div>
          <div className="absolute top-3 right-4 border border-[#1a1a1a] bg-white dark:bg-[#222] p-1 font-bold">
            GitHub
          </div>
          <div className="absolute bottom-3 left-4 border border-[#1a1a1a] bg-white dark:bg-[#222] p-1 font-bold">
            Context7
          </div>
          <div className="absolute bottom-3 right-4 border border-[#1a1a1a] bg-white dark:bg-[#222] p-1 font-bold">
            Filesystem
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function OnboardingPageFeatures({ visible }: { visible: boolean }) {
  const [slide, setSlide] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setSlide((s) => (s + 1) % FEATURES.length);
    }, 6000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible]);

  const prevSlide = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSlide((s) => (s - 1 + FEATURES.length) % FEATURES.length);
  };
  
  const nextSlide = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSlide((s) => (s + 1) % FEATURES.length);
  };

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 md:p-8 transition-all duration-500 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.98)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <h2 className="font-headline font-black text-3xl md:text-4xl uppercase text-[#1a1a1a] dark:text-[#f5f0e8] tracking-tighter">
        Core Capabilities
      </h2>

      {/* Two-Column Slider Container */}
      <div className="flex flex-col lg:flex-row items-center lg:items-stretch gap-6 lg:gap-8 max-w-5xl w-full">
        {/* Left Column: Feature Detail Card */}
        <div className="flex-1 w-full flex flex-col justify-between bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-6 md:p-8 shadow-[6px_6px_0px_0px_#1a1a1a] dark:shadow-[6px_6px_0px_0px_#f5f0e8] relative transition-transform hover:translate-y-[-2px] duration-200">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-4xl text-[#ffcc00] bg-[#1a1a1a] dark:bg-[#333] p-2 border-2 border-[#1a1a1a] dark:border-[#f5f0e8] shadow-[2px_2px_0px_#1a1a1a]">
                {FEATURES[slide].icon}
              </span>
              <h3 className="font-headline font-black text-xl md:text-2xl uppercase tracking-tight text-[#1a1a1a] dark:text-[#f5f0e8]">
                {FEATURES[slide].title}
              </h3>
            </div>
            
            <p className="font-body text-sm md:text-base text-[#4a4a4a] dark:text-[#b8b8b8] leading-relaxed min-h-[100px]">
              {FEATURES[slide].description}
            </p>
          </div>

          {/* Slide Navigation Buttons */}
          <div className="flex items-center justify-between border-t-3 border-[#1a1a1a] dark:border-[#333] pt-4 mt-6">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={prevSlide}
                className="w-10 h-10 border-3 border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#222] text-[#1a1a1a] dark:text-[#f5f0e8] flex items-center justify-center hover:bg-[#ffcc00] hover:text-[#1a1a1a] transition-all duration-150 active:translate-x-0.5 active:translate-y-0.5"
                aria-label="Previous feature"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={nextSlide}
                className="w-10 h-10 border-3 border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#222] text-[#1a1a1a] dark:text-[#f5f0e8] flex items-center justify-center hover:bg-[#ffcc00] hover:text-[#1a1a1a] transition-all duration-150 active:translate-x-0.5 active:translate-y-0.5"
                aria-label="Next feature"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
            
            {/* Dots indicator */}
            <div className="flex gap-1.5">
              {FEATURES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (timerRef.current) clearInterval(timerRef.current);
                    setSlide(i);
                  }}
                  className={`w-2.5 h-2.5 transition-all border border-[#1a1a1a] dark:border-[#f5f0e8] ${
                    slide === i ? "bg-[#ffcc00] scale-110" : "bg-gray-300 dark:bg-gray-700"
                  }`}
                  aria-label={`Go to feature slide ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Visual Mockup / Feature Placeholder Card */}
        <div className="w-full lg:w-[450px] h-[250px] lg:h-auto border-4 border-[#1a1a1a] dark:border-[#f5f0e8] bg-white dark:bg-[#1e1e1e] p-3 shadow-[6px_6px_0px_0px_#1a1a1a] dark:shadow-[6px_6px_0px_0px_#f5f0e8] flex flex-col relative group transition-transform hover:translate-y-[-2px] duration-200">
          {/* Wireframe Grid Background overlay */}
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.07] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />
          
          {/* Subtitle bar to style the placeholder nicely */}
          <div className="absolute -top-3.5 right-4 bg-[#e63b2e] text-white border-2 border-[#1a1a1a] px-2 py-0.5 text-[8px] font-headline font-black uppercase tracking-wider shadow-[2px_2px_0px_#1a1a1a]">
            PREVIEW
          </div>

          <div className="flex-1 border-3 border-[#1a1a1a] dark:border-[#333] overflow-hidden relative">
            <FeaturePlaceholder index={slide} />
          </div>
        </div>
      </div>

      <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
        Slide {slide + 1} / {FEATURES.length}
      </p>
    </div>
  );
}
