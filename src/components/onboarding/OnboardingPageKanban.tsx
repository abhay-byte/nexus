import { useContext, useState } from "react";
import { OnboardingContext } from "./Onboarding";
import { API_BASE } from "../../lib/api";
import type { KanbanOnboardingChoice } from "./Onboarding";

async function testPlankaConnection(baseUrl: string, email: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/api/planka-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${baseUrl.replace(/\/+$/, "")}/api/access-tokens`,
      method: "POST",
      body: JSON.stringify({ emailOrUsername: email, password }),
      token: "",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const item = data?.item ?? data;
  const token = typeof data?.token === "string" ? data.token : item?.token;
  if (!token) throw new Error("No token in response");
  return { token };
}

export function OnboardingPageKanban({ visible }: { visible: boolean }) {
  const { kanbanChoice, setKanbanChoice } = useContext(OnboardingContext);

  const [plankaUrl, setPlankaUrl] = useState("http://localhost:3000");
  const [plankaEmail, setPlankaEmail] = useState("");
  const [plankaPassword, setPlankaPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  const selectedType = kanbanChoice?.type ?? null;

  const selectLocal = () => {
    setKanbanChoice({ type: "local" });
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
      const { token } = await testPlankaConnection(plankaUrl.trim(), plankaEmail.trim(), plankaPassword.trim());
      setTestSuccess(true);
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
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
    >
      <h2 className="font-['Space_Grotesk'] font-black text-3xl uppercase text-[#f5f0e8] tracking-tighter">
        Kanban Setup
      </h2>
      <p className="font-body text-sm text-[#666] -mt-2">
        Choose how you want to manage your project tasks
      </p>

      <div className="flex gap-6 max-w-xl w-full">
        {/* Local Kanban */}
        <button
          type="button"
          onClick={selectLocal}
          className={`flex-1 flex flex-col items-center gap-4 p-8 border-4 transition-all duration-200 ${
            selectedType === "local"
              ? "border-[#ffcc00] scale-105 shadow-[6px_6px_0px_0px_#ffcc00]"
              : "border-[#2a2a2a] hover:border-[#555]"
          }`}
        >
          <span className="material-symbols-outlined text-5xl text-[#10B981]">view_kanban</span>
          <span className="font-['Space_Grotesk'] font-black text-xl uppercase tracking-tight text-[#f5f0e8]">
            Local Kanban
          </span>
          <span className="font-body text-xs text-[#666] text-center">
            Built-in board stored locally. No setup required.
          </span>
          {selectedType === "local" && (
            <span className="material-symbols-outlined text-[#ffcc00]">check_circle</span>
          )}
        </button>

        {/* Planka Cloud */}
        <button
          type="button"
          onClick={selectPlanka}
          className={`flex-1 flex flex-col items-center gap-4 p-8 border-4 transition-all duration-200 ${
            selectedType === "planka"
              ? "border-[#ffcc00] scale-105 shadow-[6px_6px_0px_0px_#ffcc00]"
              : "border-[#2a2a2a] hover:border-[#555]"
          }`}
        >
          <span className="material-symbols-outlined text-5xl text-[#60A5FA]">cloud_sync</span>
          <span className="font-['Space_Grotesk'] font-black text-xl uppercase tracking-tight text-[#f5f0e8]">
            Planka Cloud
          </span>
          <span className="font-body text-xs text-[#666] text-center">
            Self-hosted Planka. Team sync, live updates.
          </span>
          {selectedType === "planka" && (
            <span className="material-symbols-outlined text-[#ffcc00]">check_circle</span>
          )}
        </button>
      </div>

      {/* Planka connection form */}
      {selectedType === "planka" && !testSuccess && (
        <div className="w-full max-w-md bg-[#1a1a1a] border-4 border-[#2a2a2a] p-6 flex flex-col gap-4">
          <h3 className="font-['Space_Grotesk'] font-bold text-sm uppercase text-[#ffcc00] tracking-wider">
            Connect to Planka
          </h3>

          <input
            className="w-full bg-[#0d0d0d] border-3 border-[#333] p-3 font-mono text-sm text-[#f5f0e8] outline-none focus:border-[#ffcc00] placeholder-[#555]"
            placeholder="Planka URL (e.g. http://localhost:3000)"
            value={plankaUrl}
            onChange={(e) => setPlankaUrl(e.target.value)}
          />
          <input
            className="w-full bg-[#0d0d0d] border-3 border-[#333] p-3 font-mono text-sm text-[#f5f0e8] outline-none focus:border-[#ffcc00] placeholder-[#555]"
            placeholder="Email"
            value={plankaEmail}
            onChange={(e) => setPlankaEmail(e.target.value)}
          />
          <input
            className="w-full bg-[#0d0d0d] border-3 border-[#333] p-3 font-mono text-sm text-[#f5f0e8] outline-none focus:border-[#ffcc00] placeholder-[#555]"
            type="password"
            placeholder="Password"
            value={plankaPassword}
            onChange={(e) => setPlankaPassword(e.target.value)}
          />

          {testError && (
            <div className="border-2 border-[#EF4444] bg-[#EF4444]/10 p-3 font-mono text-xs text-[#EF4444]">
              {testError}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing || !plankaUrl.trim() || !plankaEmail.trim() || !plankaPassword.trim()}
            className="w-full bg-[#ffcc00] border-3 border-[#ffcc00] py-3 font-['Space_Grotesk'] font-black text-sm uppercase text-[#1a1a1a] hover:bg-[#e6b800] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        </div>
      )}

      {/* Test success state */}
      {selectedType === "planka" && testSuccess && (
        <div className="w-full max-w-md bg-[#1a1a1a] border-4 border-[#10B981] p-6 flex items-center gap-4">
          <span className="material-symbols-outlined text-3xl text-[#10B981]">check_circle</span>
          <div>
            <p className="font-['Space_Grotesk'] font-bold text-[#10B981] uppercase text-sm">Connected</p>
            <p className="font-mono text-xs text-[#888]">{plankaUrl}</p>
          </div>
        </div>
      )}

      {(selectedType === "local" || testSuccess) && (
        <p className="font-body text-xs text-[#555]">
          You can change or connect later from the Kanban tab
        </p>
      )}
    </div>
  );
}
