import { useContext, useState, useEffect } from "react";
import { OnboardingContext } from "./Onboarding";
import type { KanbanOnboardingChoice } from "./Onboarding";
import { PlankaInstructions } from "../Kanban/PlankaInstructions";
import { LocalKanbanInstructions } from "../Kanban/LocalKanbanInstructions";
import { plankaLogin } from "../../lib/planka";
import { useSessionStore } from "../../store/sessionStore";

export function OnboardingPageKanban({ visible }: { visible: boolean }) {
  const { kanbanChoice, setKanbanChoice, projectDraft } = useContext(OnboardingContext);
  const plankaGlobal = useSessionStore((s) => s.settings.plankaGlobal);
  const upsertSettings = useSessionStore((s) => s.upsertSettings);

  const [showLocalGuide, setShowLocalGuide] = useState(false);
  const [showPlankaGuide, setShowPlankaGuide] = useState(false);

  const [plankaUrl, setPlankaUrl] = useState(() => plankaGlobal?.baseUrl || "http://localhost:3000");
  const [plankaEmail, setPlankaEmail] = useState(() => plankaGlobal?.email || "");
  const [plankaPassword, setPlankaPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  // Sync from global settings when they load
  useEffect(() => {
    if (plankaGlobal?.baseUrl) setPlankaUrl(plankaGlobal.baseUrl);
    if (plankaGlobal?.email) setPlankaEmail(plankaGlobal.email);
  }, [plankaGlobal?.baseUrl, plankaGlobal?.email]);

  const selectedType = kanbanChoice?.type ?? "local"; // Default to local for clean starting choice

  const selectLocal = () => {
    setKanbanChoice({ type: "local" });
    setTestSuccess(false);
    setTestError(null);
  };

  const selectPlanka = () => {
    setKanbanChoice({ type: "planka" });
  };

  const handleTest = async () => {
    if (!plankaUrl.trim() || !plankaEmail.trim() || !plankaPassword.trim()) return;
    setTesting(true);
    setTestError(null);
    setTestSuccess(false);
    try {
      const token = await plankaLogin(plankaUrl.trim(), plankaEmail.trim(), plankaPassword.trim());
      setTestSuccess(true);
      // Save credentials globally so settings and kanban boards can reuse them
      upsertSettings({
        plankaGlobal: { baseUrl: plankaUrl.trim(), email: plankaEmail.trim(), token },
      });
      setKanbanChoice({
        type: "planka",
        plankaConfig: {
          baseUrl: plankaUrl.trim(),
          email: plankaEmail.trim(),
          password: plankaPassword.trim(),
          token,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      setTestError(msg);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto h-full w-full p-6 md:p-8 transition-all duration-500 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.98)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="my-auto flex flex-col items-center gap-6 w-full max-w-xl py-8">
        <div className="text-center max-w-xl shrink-0">
          <h2 className="font-headline font-black text-3xl md:text-4xl uppercase text-[#1a1a1a] dark:text-[#f5f0e8] tracking-tighter">
            Kanban Setup
          </h2>
          <p className="font-body text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Choose how you want to manage your project tasks
          </p>
        </div>

        {/* Segmented Top Control when Planka is chosen to avoid height clutter */}
        {selectedType === "planka" ? (
          <div className="flex border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-1 bg-white dark:bg-[#1a1a1a] shrink-0 shadow-[4px_4px_0px_#1a1a1a] dark:shadow-[4px_4px_0px_#f5f0e8] mb-2">
            <button
              type="button"
              onClick={selectLocal}
              className="px-4 py-1.5 font-headline font-black text-xs uppercase text-gray-500 dark:text-gray-400 hover:text-[#1a1a1a] dark:hover:text-white transition-colors duration-150 cursor-pointer"
            >
              ← Switch to Local Kanban
            </button>
            <div className="w-[3px] bg-[#1a1a1a] dark:bg-[#f5f0e8] mx-1 opacity-20" />
            <button
              type="button"
              disabled
              className="px-4 py-1.5 font-headline font-black text-xs uppercase bg-[#ffcc00] text-[#1a1a1a] border-2 border-[#1a1a1a] dark:border-[#f5f0e8]"
            >
              Planka Cloud Setup
            </button>
          </div>
        ) : (
          /* Giant selection cards (only visible when type is "local") */
          <div className="flex flex-col sm:flex-row gap-6 max-w-xl w-full shrink-0">
            {/* Local Kanban Card */}
            <button
              type="button"
              onClick={selectLocal}
              className="flex-1 flex flex-col items-center gap-3 p-6 border-4 border-[#ffcc00] bg-white dark:bg-[#222] text-[#1a1a1a] dark:text-white shadow-[6px_6px_0px_0px_#ffcc00] scale-102 transition-all duration-200 cursor-pointer"
            >
              <span className="material-symbols-outlined text-5xl text-[#10B981]">view_kanban</span>
              <span className="font-headline font-black text-lg uppercase tracking-tight">
                Local Kanban
              </span>
              <span className="font-body text-[11px] text-gray-500 text-center leading-normal">
                Built-in board stored locally. No setup required. Fast, direct, and completely offline.
              </span>
              <div className="h-6 mt-1 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#ffcc00] text-xl animate-[scaleIn_0.15s_ease-out]">check_circle</span>
              </div>
            </button>

            {/* Planka Cloud Card */}
            <button
              type="button"
              onClick={selectPlanka}
              className="flex-1 flex flex-col items-center gap-3 p-6 border-4 border-[#1a1a1a] dark:border-[#333] bg-[#fff] dark:bg-[#1a1a1a] text-[#1a1a1a] dark:text-[#888] hover:border-[#ffcc00] transition-all duration-200 cursor-pointer"
            >
              <span className="material-symbols-outlined text-5xl text-[#60A5FA]">cloud_sync</span>
              <span className="font-headline font-black text-lg uppercase tracking-tight">
                Planka Cloud
              </span>
              <span className="font-body text-[11px] text-gray-500 text-center leading-normal">
                Connect to a self-hosted Planka server. Live team syncing, board sharing, and task syncing.
              </span>
              <div className="h-6 mt-1" />
            </button>
          </div>
        )}

        {/* Planka connection form */}
        {selectedType === "planka" && !testSuccess && (
          <div className="w-full max-w-md bg-white dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#f5f0e8] p-6 flex flex-col gap-5 shadow-[6px_6px_0px_0px_#1a1a1a] dark:shadow-[6px_6px_0px_0px_#f5f0e8] animate-[fadeInUp_0.25s_ease-out] shrink-0">
            <h3 className="font-headline font-black text-sm uppercase text-[#e63b2e] dark:text-[#ffcc00] tracking-wider border-b-2 border-dashed border-[#1a1a1a] dark:border-[#333] pb-2">
              Planka Configuration
            </h3>

            <div className="flex flex-col gap-4">
              <input
                className="w-full bg-transparent border-b-3 border-[#1a1a1a] dark:border-[#333] p-2 font-mono text-sm text-[#1a1a1a] dark:text-[#f5f0e8] outline-none focus:border-[#ffcc00] dark:focus:border-[#ffcc00] placeholder-gray-400 dark:placeholder-gray-600 transition-colors"
                placeholder="Server URL (e.g. http://localhost:3000)"
                value={plankaUrl}
                onChange={(e) => setPlankaUrl(e.target.value)}
              />
              <input
                className="w-full bg-transparent border-b-3 border-[#1a1a1a] dark:border-[#333] p-2 font-mono text-sm text-[#1a1a1a] dark:text-[#f5f0e8] outline-none focus:border-[#ffcc00] dark:focus:border-[#ffcc00] placeholder-gray-400 dark:placeholder-gray-600 transition-colors"
                placeholder="Email / Username"
                value={plankaEmail}
                onChange={(e) => setPlankaEmail(e.target.value)}
              />
              <input
                className="w-full bg-transparent border-b-3 border-[#1a1a1a] dark:border-[#333] p-2 font-mono text-sm text-[#1a1a1a] dark:text-[#f5f0e8] outline-none focus:border-[#ffcc00] dark:focus:border-[#ffcc00] placeholder-gray-400 dark:placeholder-gray-600 transition-colors"
                type="password"
                placeholder="Password"
                value={plankaPassword}
                onChange={(e) => setPlankaPassword(e.target.value)}
              />
            </div>

            {testError && (
              <div className="border-3 border-[#e63b2e] bg-[#e63b2e]/10 p-3 font-mono text-xs text-[#e63b2e] shadow-[2px_2px_0px_#e63b2e]">
                Error: {testError}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing || !plankaUrl.trim() || !plankaEmail.trim() || !plankaPassword.trim()}
              className="w-full bg-[#ffcc00] border-3 border-[#1a1a1a] dark:border-[#f5f0e8] py-3 font-headline font-black text-sm uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white dark:hover:bg-white dark:hover:text-[#1a1a1a] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shadow-[4px_4px_0px_#1a1a1a] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
            >
              {testing ? "Connecting..." : "Test & Connect"}
            </button>

            <button
              type="button"
              onClick={() => setShowPlankaGuide(true)}
              className="text-xs font-headline font-black uppercase text-[#0055ff] dark:text-[#ffcc00] hover:underline flex items-center gap-1.5 justify-center mt-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm font-bold">menu_book</span>
              Need to host Planka yourself? View Docker Setup
            </button>
          </div>
        )}

        {/* Test success state */}
        {selectedType === "planka" && testSuccess && (
          <div className="flex flex-col items-center gap-3 w-full shrink-0">
            <div className="w-full max-w-md bg-white dark:bg-[#1a1a1a] border-4 border-[#10B981] p-6 flex items-center gap-4 shadow-[6px_6px_0px_0px_#10B981] animate-[fadeInUp_0.25s_ease-out]">
              <span className="material-symbols-outlined text-4xl text-[#10B981]">check_circle</span>
              <div className="overflow-hidden">
                <p className="font-headline font-black text-[#10B981] uppercase text-sm">Synchronized Successfully</p>
                <p className="font-mono text-[10px] text-gray-500 truncate">{plankaUrl}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPlankaGuide(true)}
              className="text-xs font-headline font-black uppercase text-[#0055ff] dark:text-[#ffcc00] hover:underline flex items-center gap-1.5 justify-center mt-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm font-bold">menu_book</span>
              AI Agent Planka API instructions Guide
            </button>
          </div>
        )}

        {/* Small hints at the bottom */}
        {(selectedType === "local" || testSuccess) && (
          <div className="flex flex-col items-center gap-2 mt-2 shrink-0">
            <p className="font-body text-xs text-gray-500 dark:text-gray-400 text-center">
              * You can always switch columns, sync with a cloud, or sign out later from the Kanban tab.
            </p>
            {selectedType === "local" && (
              <button
                type="button"
                onClick={() => setShowLocalGuide(true)}
                className="text-xs font-headline font-black uppercase text-[#0055ff] dark:text-[#ffcc00] hover:underline flex items-center gap-1.5 justify-center mt-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm font-bold">menu_book</span>
                AI Agent Local Kanban Instructions Guide
              </button>
            )}
          </div>
        )}
      </div>

      {/* Local instructions modal overlay */}
      {showLocalGuide && (
        <LocalKanbanInstructions
          projectId="first-project"
          projectName={projectDraft.name || "My Project"}
          onClose={() => setShowLocalGuide(false)}
        />
      )}

      {/* Planka instructions modal overlay */}
      {showPlankaGuide && (
        <PlankaInstructions
          config={
            kanbanChoice?.plankaConfig
              ? {
                  baseUrl: kanbanChoice.plankaConfig.baseUrl,
                  email: kanbanChoice.plankaConfig.email,
                  password: kanbanChoice.plankaConfig.password,
                  token: kanbanChoice.plankaConfig.token,
                }
              : undefined
          }
          onClose={() => setShowPlankaGuide(false)}
        />
      )}
    </div>
  );
}
