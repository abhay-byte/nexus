import { useContext } from "react";
import { OnboardingContext } from "./Onboarding";

export function OnboardingPageTheme({ visible }: { visible: boolean }) {
  const { theme, setTheme } = useContext(OnboardingContext);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 p-8 transition-all duration-500 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.98)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <h2 className="font-headline font-black text-3xl md:text-4xl uppercase text-[#1a1a1a] dark:text-[#f5f0e8] tracking-tighter">
        Choose Your Theme
      </h2>
      <p className="font-body text-sm text-gray-500 dark:text-gray-400 -mt-6">
        Select the visual workspace experience that fits you best
      </p>

      <div className="flex flex-col sm:flex-row gap-8 max-w-2xl w-full">
        {/* Dark card */}
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={`flex-1 flex flex-col items-center gap-4 p-6 border-4 transition-all duration-200 cursor-pointer ${
            theme === "dark"
              ? "border-[#ffcc00] bg-[#111] text-white shadow-[6px_6px_0px_0px_#ffcc00] scale-102"
              : "border-[#1a1a1a] dark:border-[#333] bg-[#fff] dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#888] hover:border-[#ffcc00] hover:scale-[1.01]"
          }`}
        >
          {/* Mockup layout */}
          <div className="w-full h-32 bg-[#181818] border-3 border-[#1a1a1a] flex flex-col p-3 gap-1 relative overflow-hidden">
            <div className="h-3 w-16 bg-[#ffcc00]" />
            <div className="flex gap-1 mt-1">
              <div className="h-2 w-10 bg-[#333]" />
              <div className="h-2 w-14 bg-[#333]" />
            </div>
            <div className="flex-1 flex gap-2 mt-2">
              <div className="w-1/3 bg-[#222] border border-[#333]" />
              <div className="w-2/3 bg-[#0d0d0d] border border-[#333]" />
            </div>
          </div>
          <span className="font-headline font-black text-xl uppercase tracking-tight">
            Dark Mode
          </span>
          <div className="flex items-center gap-1.5 h-6">
            {theme === "dark" ? (
              <span className="material-symbols-outlined text-[#ffcc00] text-xl animate-[scaleIn_0.15s_ease-out]">check_circle</span>
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-400 dark:border-gray-600" />
            )}
          </div>
        </button>

        {/* Light card */}
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={`flex-1 flex flex-col items-center gap-4 p-6 border-4 transition-all duration-200 cursor-pointer ${
            theme === "light"
              ? "border-[#ffcc00] bg-[#faf7f2] text-[#1a1a1a] shadow-[6px_6px_0px_0px_#ffcc00] scale-102"
              : "border-[#1a1a1a] dark:border-[#333] bg-[#fff] dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#888] hover:border-[#ffcc00] hover:scale-[1.01]"
          }`}
        >
          {/* Mockup layout */}
          <div className="w-full h-32 bg-[#faf7f2] border-3 border-[#1a1a1a] flex flex-col p-3 gap-1 relative overflow-hidden">
            <div className="h-3 w-16 bg-[#0055ff]" />
            <div className="flex gap-1 mt-1">
              <div className="h-2 w-10 bg-[#ddd]" />
              <div className="h-2 w-14 bg-[#ddd]" />
            </div>
            <div className="flex-1 flex gap-2 mt-2">
              <div className="w-1/3 bg-[#eee9e0] border border-[#d6d1c9]" />
              <div className="w-2/3 bg-white border border-[#d6d1c9]" />
            </div>
          </div>
          <span className="font-headline font-black text-xl uppercase tracking-tight">
            Light Mode
          </span>
          <div className="flex items-center gap-1.5 h-6">
            {theme === "light" ? (
              <span className="material-symbols-outlined text-[#ffcc00] text-xl animate-[scaleIn_0.15s_ease-out]">check_circle</span>
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-400 dark:border-gray-600" />
            )}
          </div>
        </button>
      </div>

      <p className="font-body text-xs text-gray-500 dark:text-gray-400 mt-4">
        You can fine-tune theme colors and font families in Settings anytime.
      </p>
    </div>
  );
}
