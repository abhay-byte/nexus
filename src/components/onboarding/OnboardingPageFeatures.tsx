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
    }, 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible]);

  const prevSlide = () => setSlide((s) => (s - 1 + FEATURES.length) % FEATURES.length);
  const nextSlide = () => setSlide((s) => (s + 1) % FEATURES.length);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 p-8 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
    >
      <h2 className="font-['Space_Grotesk'] font-black text-3xl uppercase text-[#f5f0e8] tracking-tighter">
        What Nexus Can Do
      </h2>

      <div className="flex items-center gap-6 max-w-xl w-full">
        {/* Left arrow inside slideshow */}
        <button
          type="button"
          onClick={prevSlide}
          className="shrink-0 w-12 h-12 border-3 border-[#2a2a2a] bg-[#1a1a1a] text-[#ffcc00] flex items-center justify-center hover:border-[#ffcc00] transition-colors"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>

        <div className="flex-1 bg-[#1a1a1a] border-4 border-[#2a2a2a] p-8 text-center min-h-[260px] flex flex-col items-center justify-center gap-5">
          <span className="material-symbols-outlined text-5xl text-[#ffcc00]">
            {FEATURES[slide].icon}
          </span>
          <h3 className="font-['Space_Grotesk'] font-black text-xl uppercase text-[#f5f0e8]">
            {FEATURES[slide].title}
          </h3>
          <p className="font-body text-sm text-[#888] leading-relaxed max-w-md">
            {FEATURES[slide].description}
          </p>
        </div>

        {/* Right arrow inside slideshow */}
        <button
          type="button"
          onClick={nextSlide}
          className="shrink-0 w-12 h-12 border-3 border-[#2a2a2a] bg-[#1a1a1a] text-[#ffcc00] flex items-center justify-center hover:border-[#ffcc00] transition-colors"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      {/* Slide counter */}
      <p className="font-mono text-sm text-[#555]">
        {slide + 1} / {FEATURES.length}
      </p>
    </div>
  );
}
