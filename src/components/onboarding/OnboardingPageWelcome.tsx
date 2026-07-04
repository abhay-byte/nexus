export function OnboardingPageWelcome({ visible }: { visible: boolean }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 p-8 transition-all duration-500 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.98)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Brutalist Logo Container */}
      <div className="relative group hover:-translate-y-1 hover:-translate-x-1 transition-transform duration-200 cursor-pointer">
        <div className="absolute inset-0 bg-[#ffcc00] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] translate-x-3 translate-y-3" />
        <div className="relative bg-white dark:bg-[#222] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-6 flex items-center justify-center">
          <img
            src="/logo.png"
            alt="Nexus Logo"
            className="w-36 h-36 object-contain animate-[spin_12s_linear_infinite]"
          />
        </div>
      </div>

      <div className="text-center max-w-2xl mt-4">
        {/* Aggressive Bauhaus Headline */}
        <h1 className="font-headline font-black text-6xl md:text-7xl uppercase tracking-tighter text-[#1a1a1a] dark:text-[#f5f0e8] mb-4 leading-none select-none">
          Nexus{" "}
          <span className="bg-[#ffcc00] text-[#1a1a1a] px-3 py-1 border-4 border-[#1a1a1a] inline-block -rotate-2 shadow-[4px_4px_0px_0px_#1a1a1a] hover:rotate-0 transition-transform duration-150">
            Terminal
          </span>
        </h1>

        {/* High-energy Accent Badge */}
        <div className="inline-block bg-[#0055ff] text-white dark:text-[#f5f0e8] px-4 py-2 border-4 border-[#1a1a1a] dark:border-[#f5f0e8] font-headline font-black text-sm md:text-base uppercase tracking-wider mb-6 shadow-[3px_3px_0px_0px_#1a1a1a] dark:shadow-[3px_3px_0px_0px_#f5f0e8]">
          Multi-Agent AI Workspace
        </div>

        {/* Asymmetrical descriptive block */}
        <div className="border-l-8 border-[#e63b2e] bg-white dark:bg-[#1a1a1a]/50 p-6 text-left max-w-lg mx-auto border-4 border-r-4 border-t-4 border-b-4 border-y-[#1a1a1a] border-r-[#1a1a1a] dark:border-y-[#f5f0e8] dark:border-r-[#f5f0e8] shadow-[6px_6px_0px_0px_#1a1a1a] dark:shadow-[6px_6px_0px_0px_#f5f0e8] transition-all hover:shadow-[8px_8px_0px_0px_#1a1a1a] hover:translate-y-[-2px]">
          <p className="font-body text-sm md:text-base text-[#1a1a1a] dark:text-[#ccc] leading-relaxed">
            Run multiple AI coding agents side-by-side in split panes within a unified terminal workspace.
            Manage projects, kanban boards, git diffs, and system resources — all from one app.
          </p>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-2 font-headline font-black text-xs uppercase tracking-widest text-[#e63b2e] dark:text-[#ffcc00] animate-pulse">
        <span className="material-symbols-outlined text-sm">arrow_right_alt</span>
        Press the right arrow to get started
      </div>
    </div>
  );
}
