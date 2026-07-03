import { useContext } from "react";
import { OnboardingContext } from "./Onboarding";

export function OnboardingPageTheme({ visible }: { visible: boolean }) {
  const { theme, setTheme } = useContext(OnboardingContext);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 p-8 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
    >
      <h2 className="font-['Space_Grotesk'] font-black text-3xl uppercase text-[#f5f0e8] tracking-tighter">
        Choose Your Theme
      </h2>

      <div className="flex gap-8 max-w-2xl w-full">
        {/* Dark card */}
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={`flex-1 flex flex-col items-center gap-4 p-6 border-4 transition-all duration-200 ${
            theme === "dark"
              ? "border-[#ffcc00] scale-105 shadow-[6px_6px_0px_0px_#ffcc00]"
              : "border-[#2a2a2a] hover:border-[#555]"
          }`}
        >
          <div className="w-full h-32 bg-[#1a1a1a] border-2 border-[#333] rounded flex flex-col p-3 gap-1">
            <div className="h-3 w-16 bg-[#ffcc00] rounded" />
            <div className="flex gap-1 mt-1">
              <div className="h-2 w-10 bg-[#444] rounded" />
              <div className="h-2 w-14 bg-[#444] rounded" />
            </div>
            <div className="flex-1 flex gap-2 mt-2">
              <div className="w-1/3 bg-[#252525] rounded" />
              <div className="w-2/3 bg-[#1f1f1f] rounded border border-[#333]" />
            </div>
          </div>
          <span className="font-['Space_Grotesk'] font-black text-xl uppercase tracking-tight text-[#f5f0e8]">
            Dark
          </span>
          {theme === "dark" && (
            <span className="material-symbols-outlined text-[#ffcc00]">check_circle</span>
          )}
        </button>

        {/* Light card */}
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={`flex-1 flex flex-col items-center gap-4 p-6 border-4 transition-all duration-200 ${
            theme === "light"
              ? "border-[#ffcc00] scale-105 shadow-[6px_6px_0px_0px_#ffcc00]"
              : "border-[#2a2a2a] hover:border-[#555]"
          }`}
        >
          <div className="w-full h-32 bg-[#f5f0e8] border-2 border-[#ccc] rounded flex flex-col p-3 gap-1">
            <div className="h-3 w-16 bg-[#ffcc00] rounded" />
            <div className="flex gap-1 mt-1">
              <div className="h-2 w-10 bg-[#ddd] rounded" />
              <div className="h-2 w-14 bg-[#ddd] rounded" />
            </div>
            <div className="flex-1 flex gap-2 mt-2">
              <div className="w-1/3 bg-[#e8e3da] rounded" />
              <div className="w-2/3 bg-white rounded border border-[#ccc]" />
            </div>
          </div>
          <span className="font-['Space_Grotesk'] font-black text-xl uppercase tracking-tight text-[#f5f0e8]">
            Light
          </span>
          {theme === "light" && (
            <span className="material-symbols-outlined text-[#ffcc00]">check_circle</span>
          )}
        </button>
      </div>

      <p className="font-body text-sm text-[#555]">
        You can change this anytime in Settings
      </p>
    </div>
  );
}
