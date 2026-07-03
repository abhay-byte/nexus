import { useCallback, useState } from "react";
import {
  setPlankaConfig, plankaLogin, plankaFetchProjects, plankaFetchBoards,
  plankaFetchAllBoardData, plankaCreateProject, plankaCreateBoard,
  plankaDeleteProject, plankaDeleteBoard,
} from "../../lib/planka";
import type { PlankaProject, PlankaBoard, PlankaList, PlankaCard } from "../../types";

type WizardStep = "credentials" | "project" | "board";

interface Props {
  projectId: string;
  projectName: string;
  initialConfig?: { baseUrl?: string; email?: string; selectedProjectId?: string; selectedProjectName?: string; selectedBoardId?: string; selectedBoardName?: string; };
  onConnect: (config: { baseUrl: string; email: string; password: string; token: string; selectedProjectId: string; selectedProjectName: string; selectedBoardId: string; selectedBoardName: string; lists: PlankaList[]; cardsByList: Record<string, PlankaCard[]>; }) => void;
  onCancel: () => void;
}

interface ConfirmDeleteDialog {
  type: "project" | "board";
  id: string;
  name: string;
}

function ConfirmDialog({ item, onConfirm, onCancel, loading }: { item: ConfirmDeleteDialog; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-[#f5f0e8] dark:bg-[#1a1a1a] border-4 border-[#e63b2e] shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#333] w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b-2 border-[#e63b2e] bg-[#e63b2e] text-white">
          <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest">Delete {item.type}</span>
        </div>
        <div className="p-4">
          <p className="text-xs font-mono text-[#1a1a1a] dark:text-[#f5f0e8] mb-1">Are you sure?</p>
          <p className="text-sm font-['Space_Grotesk'] font-bold text-[#1a1a1a] dark:text-[#f5f0e8] truncate">"{item.name}"</p>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onCancel} disabled={loading} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 border-2 border-black dark:border-[#333] text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-white dark:hover:bg-[#333] disabled:opacity-40" type="button">Cancel</button>
            <button onClick={onConfirm} disabled={loading} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 bg-[#e63b2e] text-white border-2 border-[#e63b2e] hover:bg-[#c53020] disabled:opacity-40" type="button">{loading ? "Deleting…" : "Delete"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlankaSetup({ projectName, initialConfig, onConnect, onCancel }: Props) {
  const [step, setStep] = useState<WizardStep>("credentials");
  const [baseUrl, setBaseUrl] = useState(initialConfig?.baseUrl || "https://planka-latest-3twn.onrender.com");
  const [email, setEmail] = useState(initialConfig?.email || "");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<PlankaProject[]>([]);
  const [boards, setBoards] = useState<PlankaBoard[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialConfig?.selectedProjectId || "");
  const [selectedProjectName, setSelectedProjectName] = useState(initialConfig?.selectedProjectName || "");
  const [selectedBoardId, setSelectedBoardId] = useState(initialConfig?.selectedBoardId || "");
  const [selectedBoardName, setSelectedBoardName] = useState(initialConfig?.selectedBoardName || "");
  const [creatingProject, setCreatingProject] = useState(false);
  const [createProjectLoading, setCreateProjectLoading] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [createBoardLoading, setCreateBoardLoading] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteDialog | null>(null);
  const [deleting, setDeleting] = useState(false);

  const savedConfig = useCallback(() => ({ baseUrl: baseUrl.replace(/\/+$/, ""), email: email.trim(), password, token }), [baseUrl, email, password, token]);

  const handleLogin = useCallback(async () => {
    setError(""); setLoading(true);
    try {
      const t = await plankaLogin(baseUrl.replace(/\/+$/, ""), email.trim(), password);
      setToken(t);
      setPlankaConfig({ ...savedConfig(), token: t });
      setProjects(await plankaFetchProjects());
      setStep("project");
    } catch (e) { setError(e instanceof Error ? e.message : "Login failed"); }
    finally { setLoading(false); }
  }, [baseUrl, email, password, savedConfig]);

  const handleSelectProject = useCallback(async (projectId: string, projectName: string) => {
    setError(""); setLoading(true);
    setSelectedProjectId(projectId);
    setSelectedProjectName(projectName);
    try {
      setPlankaConfig({ ...savedConfig() });
      setBoards(await plankaFetchBoards(projectId));
      setStep("board");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to fetch boards"); }
    finally { setLoading(false); }
  }, [savedConfig]);

  const handleCreateProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setError(""); setCreateProjectLoading(true);
    try {
      setPlankaConfig({ ...savedConfig() });
      const proj = await plankaCreateProject(name);
      setProjects(prev => [...prev, proj]);
      setNewProjectName("");
      setSelectedProjectId(proj.id);
      setSelectedProjectName(proj.name);
      const b = await plankaFetchBoards(proj.id);
      setBoards(b);
      setCreatingProject(false);
      setStep("board");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create project"); }
    finally { setCreateProjectLoading(false); }
  }, [newProjectName, savedConfig]);

  const handleCreateBoard = useCallback(async () => {
    const name = newBoardName.trim();
    if (!name) return;
    setError(""); setCreateBoardLoading(true);
    try {
      setPlankaConfig({ ...savedConfig() });
      const board = await plankaCreateBoard(selectedProjectId, name);
      setBoards(prev => [...prev, board]);
      setNewBoardName("");
      setCreatingBoard(false);
      const data = await plankaFetchAllBoardData(board.id);
      onConnect({ ...savedConfig(), selectedProjectId, selectedProjectName, selectedBoardId: board.id, selectedBoardName: board.name, lists: data.lists, cardsByList: data.cardsByList });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create board"); }
    finally { setCreateBoardLoading(false); }
  }, [newBoardName, savedConfig, selectedProjectId, selectedProjectName, onConnect]);

  const handleSelectBoard = useCallback(async (boardId: string, boardName: string) => {
    setError(""); setLoading(true);
    setSelectedBoardId(boardId);
    setSelectedBoardName(boardName);
    try {
      setPlankaConfig({ ...savedConfig() });
      const data = await plankaFetchAllBoardData(boardId);
      onConnect({ ...savedConfig(), selectedProjectId, selectedProjectName, selectedBoardId: boardId, selectedBoardName: boardName, lists: data.lists, cardsByList: data.cardsByList });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to fetch board data"); }
    finally { setLoading(false); }
  }, [savedConfig, selectedProjectId, selectedProjectName, onConnect]);

  const executeDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      setPlankaConfig({ ...savedConfig() });
      if (confirmDelete.type === "project") {
        await plankaDeleteProject(confirmDelete.id);
        setProjects(prev => prev.filter(p => p.id !== confirmDelete.id));
      } else {
        await plankaDeleteBoard(confirmDelete.id);
        setBoards(prev => prev.filter(b => b.id !== confirmDelete.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to delete ${confirmDelete.type}`);
    } finally { setDeleting(false); setConfirmDelete(null); }
  }, [confirmDelete, savedConfig]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {confirmDelete && <ConfirmDialog item={confirmDelete} onConfirm={executeDelete} onCancel={() => setConfirmDelete(null)} loading={deleting} />}
      <div className="bg-[#f5f0e8] dark:bg-[#1a1a1a] border-4 border-[#1a1a1a] dark:border-[#333] w-full max-w-lg mx-4 shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#333]">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black dark:border-[#333] bg-[#ffcc00]">
          <div className="flex items-center gap-2">
            <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest text-[#1a1a1a]">◈ Planka Connect</span>
            <span className="text-[10px] font-mono text-[#1a1a1a]/60">— {projectName}</span>
          </div>
          <button onClick={onCancel} className="text-[#1a1a1a] hover:text-[#e63b2e] font-black text-lg leading-none" type="button">✕</button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div className="flex gap-1 mb-2">
            {(["credentials", "project", "board"] as WizardStep[]).map((s) => (
              <div key={s} className={`h-1 flex-1 border ${step === s ? "bg-[#ffcc00] border-[#ffcc00]" : ["credentials", "project", "board"].indexOf(step) > ["credentials", "project", "board"].indexOf(s) ? "bg-[#10b981] border-[#10b981]" : "bg-transparent border-[#ccc] dark:border-[#444]"}`} />
            ))}
          </div>

          {error && (<div className="border-2 border-[#e63b2e] bg-[#e63b2e]/10 text-[#e63b2e] p-3 text-xs font-mono">{error}</div>)}

          {step === "credentials" && (
            <>
              <div><label className="block text-xs font-['Space_Grotesk'] font-black uppercase tracking-wide text-[#1a1a1a] dark:text-[#f5f0e8] mb-1">Planka URL</label><input className="w-full bg-white dark:bg-[#0d0d0d] border-2 border-black dark:border-[#333] p-2 text-xs font-mono text-[#1a1a1a] dark:text-[#f5f0e8] focus:border-[#ffcc00] outline-none" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://planka.example.com" /></div>
              <div><label className="block text-xs font-['Space_Grotesk'] font-black uppercase tracking-wide text-[#1a1a1a] dark:text-[#f5f0e8] mb-1">Email</label><input className="w-full bg-white dark:bg-[#0d0d0d] border-2 border-black dark:border-[#333] p-2 text-xs font-mono text-[#1a1a1a] dark:text-[#f5f0e8] focus:border-[#ffcc00] outline-none" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" /></div>
              <div><label className="block text-xs font-['Space_Grotesk'] font-black uppercase tracking-wide text-[#1a1a1a] dark:text-[#f5f0e8] mb-1">Password</label><input type="password" className="w-full bg-white dark:bg-[#0d0d0d] border-2 border-black dark:border-[#333] p-2 text-xs font-mono text-[#1a1a1a] dark:text-[#f5f0e8] focus:border-[#ffcc00] outline-none" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={onCancel} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 border-2 border-black dark:border-[#333] text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-white dark:hover:bg-[#333]" type="button">Cancel</button>
                <button onClick={handleLogin} disabled={loading || !baseUrl || !email || !password} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 bg-[#ffcc00] text-[#1a1a1a] border-2 border-black hover:bg-[#f0c000] disabled:opacity-40 disabled:cursor-not-allowed" type="button">{loading ? "Connecting…" : "Connect →"}</button>
              </div>
            </>
          )}

          {step === "project" && (
            <>
              <p className="text-xs font-mono text-[#555] dark:text-[#888]">Select or create a project:</p>
              {loading && <p className="text-xs font-mono text-[#ffcc00]">Loading…</p>}
              <div className="max-h-64 overflow-y-auto flex flex-col gap-1 border-2 border-black dark:border-[#333]">
                {projects.map(p => (
                  <div key={p.id} className="flex items-center border-b border-[#ddd] dark:border-[#333] last:border-b-0">
                    <button onClick={() => handleSelectProject(p.id, p.name)} disabled={loading} className="flex-1 text-left px-3 py-2 text-xs font-['Space_Grotesk'] font-bold text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-[#ffcc00] hover:text-[#1a1a1a] disabled:opacity-40" type="button">
                      {p.name}
                    </button>
                    <button onClick={() => setConfirmDelete({ type: "project", id: p.id, name: p.name })} className="text-[10px] text-[#999] hover:text-[#e63b2e] px-2 py-2 shrink-0" title="Delete project" type="button">✕</button>
                  </div>
                ))}
              </div>

              {creatingProject ? (
                <div className="border-2 border-[#ffcc00] bg-white dark:bg-[#111] p-3">
                  <input className="w-full bg-transparent text-[#1a1a1a] dark:text-[#f5f0e8] font-['Space_Grotesk'] text-xs outline-none border-b border-[#ffcc00] pb-1" placeholder="Project name…" autoFocus value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleCreateProject(); if (e.key === "Escape") { setCreatingProject(false); setNewProjectName(""); } }} />
                  <div className="flex justify-end gap-2 mt-2">
                    <button className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-3 py-1 text-[#888] hover:text-[#f5f0e8]" onClick={() => { setCreatingProject(false); setNewProjectName(""); }} type="button">Cancel</button>
                    <button className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-3 py-1 bg-[#ffcc00] text-[#1a1a1a] hover:bg-[#f0c000] disabled:opacity-40" onClick={handleCreateProject} disabled={createProjectLoading} type="button">{createProjectLoading ? "Creating…" : "Create & Select"}</button>
                  </div>
                </div>
              ) : (
                <button className="w-full text-left text-xs font-['Space_Grotesk'] uppercase font-bold text-gray-400 dark:text-[#333] hover:text-[#ffcc00] dark:hover:text-[#ffcc00] border border-dashed border-gray-300 dark:border-[#444] hover:border-[#ffcc00] dark:hover:border-[#ffcc00] p-2 transition-colors" onClick={() => setCreatingProject(true)} type="button">+ Create new project</button>
              )}

              <div className="flex justify-between mt-2">
                <button onClick={() => setStep("credentials")} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 border-2 border-black dark:border-[#333] text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-white dark:hover:bg-[#333]" type="button">← Back</button>
                <button onClick={onCancel} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 text-[#888] hover:text-[#e63b2e]" type="button">Cancel</button>
              </div>
            </>
          )}

          {step === "board" && (
            <>
              <p className="text-xs font-mono text-[#555] dark:text-[#888]">Project: <span className="font-bold">{selectedProjectName}</span></p>
              <p className="text-xs font-mono text-[#555] dark:text-[#888]">Select or create a board:</p>
              {(loading || createBoardLoading) && <p className="text-xs font-mono text-[#ffcc00] animate-pulse">Loading…</p>}
              {!loading && !createBoardLoading && boards.length === 0 && !creatingBoard && (
                <div className="text-center py-4"><p className="text-xs font-mono text-[#888]">No boards in this project.</p></div>
              )}
              <div className="max-h-64 overflow-y-auto flex flex-col gap-1 border-2 border-black dark:border-[#333]">
                {boards.map(b => (
                  <div key={b.id} className="flex items-center border-b border-[#ddd] dark:border-[#333] last:border-b-0">
                    <button onClick={() => handleSelectBoard(b.id, b.name)} disabled={loading} className="flex-1 text-left px-3 py-2 text-xs font-['Space_Grotesk'] font-bold text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-[#ffcc00] hover:text-[#1a1a1a] disabled:opacity-40" type="button">{b.name}</button>
                    <button onClick={() => setConfirmDelete({ type: "board", id: b.id, name: b.name })} className="text-[10px] text-[#999] hover:text-[#e63b2e] px-2 py-2 shrink-0" title="Delete board" type="button">✕</button>
                  </div>
                ))}
              </div>

              {creatingBoard ? (
                <div className="border-2 border-[#ffcc00] bg-white dark:bg-[#111] p-3">
                  <input className="w-full bg-transparent text-[#1a1a1a] dark:text-[#f5f0e8] font-['Space_Grotesk'] text-xs outline-none border-b border-[#ffcc00] pb-1" placeholder="Board name…" autoFocus value={newBoardName} onChange={e => setNewBoardName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleCreateBoard(); if (e.key === "Escape") { setCreatingBoard(false); setNewBoardName(""); } }} />
                  <div className="flex justify-end gap-2 mt-2">
                    <button className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-3 py-1 text-[#888] hover:text-[#f5f0e8]" onClick={() => { setCreatingBoard(false); setNewBoardName(""); }} type="button">Cancel</button>
                    <button className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-3 py-1 bg-[#ffcc00] text-[#1a1a1a] hover:bg-[#f0c000] disabled:opacity-40" onClick={handleCreateBoard} disabled={createBoardLoading} type="button">{createBoardLoading ? "Creating…" : "Create & Select"}</button>
                  </div>
                </div>
              ) : (
                <button className="w-full text-left text-xs font-['Space_Grotesk'] uppercase font-bold text-gray-400 dark:text-[#333] hover:text-[#ffcc00] dark:hover:text-[#ffcc00] border border-dashed border-gray-300 dark:border-[#444] hover:border-[#ffcc00] dark:hover:border-[#ffcc00] p-2 transition-colors" onClick={() => setCreatingBoard(true)} type="button">+ Create new board</button>
              )}

              <div className="flex justify-between mt-2">
                <button onClick={() => setStep("project")} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 border-2 border-black dark:border-[#333] text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-white dark:hover:bg-[#333]" type="button">← Back</button>
                <button onClick={onCancel} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 text-[#888] hover:text-[#e63b2e]" type="button">Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
