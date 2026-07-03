export function OnboardingPageWelcome({ visible }: { visible: boolean }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 p-8 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
    >
      <img
        src="/logo.png"
        alt="Nexus Logo"
        className="w-48 h-48 object-contain"
      />

      <div className="text-center max-w-lg">
        <h1 className="font-['Space_Grotesk'] font-black text-5xl uppercase tracking-tighter text-[#f5f0e8] mb-4">
          Nexus Terminal
        </h1>
        <p className="font-['Space_Grotesk'] font-bold text-xl text-[#ffcc00] mb-3">
          Multi-Agent AI Terminal Workspace
        </p>
        <p className="font-body text-base text-[#888] leading-relaxed">
          Run multiple AI coding agents side-by-side in split panes within a unified terminal workspace.
          Manage projects, kanban boards, git diffs, and system resources — all from one app.
        </p>
      </div>

      <p className="font-['Space_Grotesk'] text-sm text-[#555] uppercase tracking-widest animate-pulse">
        Press the right arrow to get started
      </p>
    </div>
  );
}
