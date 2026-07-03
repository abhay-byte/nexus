import { useCallback, useEffect, useRef, useState } from "react";
import { KANBAN_COLUMNS, type KanbanStatus, useKanbanStore } from "../../store/kanbanStore";
import { listen } from "../../lib/api";
import { PlankaSetup } from "./PlankaSetup";
import { PlankaInstructions } from "./PlankaInstructions";
import { LocalKanbanInstructions } from "./LocalKanbanInstructions";
import { useProjectStore } from "../../store/projectStore";
import {
  setPlankaConfig, plankaFetchAllBoardData, plankaCreateCard, plankaMoveCard,
  plankaUpdateCard, plankaDeleteCard, plankaCreateList, plankaDeleteList,
} from "../../lib/planka";
import type { PlankaCard, PlankaConfig, PlankaList, Project } from "../../types";

interface KanbanBoardProps {
  projectId: string;
  projectName: string;
}

export function KanbanBoard({ projectId, projectName }: KanbanBoardProps) {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const plankaConfig = project?.planka;
  const hasPlanka = !!(plankaConfig?.token && plankaConfig?.selectedBoardId);

  if (hasPlanka) {
    return <PlankaKanbanBoard projectId={projectId} projectName={projectName} config={plankaConfig!} />;
  }

  return <LocalKanbanBoard projectId={projectId} projectName={projectName} />;
}

/* ── Local board ───────────────────────────────────────────────────────── */

function LocalKanbanBoard({ projectId, projectName }: { projectId: string; projectName: string }) {
  const tasks = useKanbanStore((s) => s.tasks.filter((t) => t.projectId === projectId));
  const addTask = useKanbanStore((s) => s.addTask);
  const moveTask = useKanbanStore((s) => s.moveTask);
  const deleteTask = useKanbanStore((s) => s.deleteTask);
  const updateTask = useKanbanStore((s) => s.updateTask);
  const updateProject = useProjectStore((s) => s.updateProject);

  const [showSetup, setShowSetup] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    // Force-clear stale in-memory state, then sync from server.
    // This ensures HMR / restarts never show old persist data.
    useKanbanStore.setState({ tasks: [] });
    useKanbanStore.getState().syncFromServer();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("kanban-refresh", () => {
      useKanbanStore.getState().syncFromServer();
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  const [drafts, setDrafts] = useState<Record<KanbanStatus, string>>({ todo: "", "in-progress": "", done: "", blocked: "" });
  const [adding, setAdding] = useState<KanbanStatus | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [dragOverCol, setDragOverCol] = useState<KanbanStatus | null>(null);

  const handleAdd = (status: KanbanStatus) => {
    const title = drafts[status].trim();
    if (!title) return;
    addTask(projectId, status, title);
    setDrafts((d) => ({ ...d, [status]: "" }));
    setAdding(null);
  };

  const handlePlankaConnect = (data: { baseUrl: string; email: string; password: string; token: string; selectedProjectId: string; selectedProjectName: string; selectedBoardId: string; selectedBoardName: string; lists: PlankaList[]; cardsByList: Record<string, PlankaCard[]> }) => {
    updateProject(projectId, { planka: { baseUrl: data.baseUrl, email: data.email, password: data.password, token: data.token, selectedProjectId: data.selectedProjectId, selectedProjectName: data.selectedProjectName, selectedBoardId: data.selectedBoardId, selectedBoardName: data.selectedBoardName } });
    setShowSetup(false);
  };

  const STATUSES = KANBAN_COLUMNS.map((c) => c.id);
  const nextStatus = (s: KanbanStatus): KanbanStatus => STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];

  return (
    <>
      {showSetup && (<PlankaSetup projectId={projectId} projectName={projectName} onConnect={handlePlankaConnect} onCancel={() => setShowSetup(false)} />)}
      {showInstructions && (<LocalKanbanInstructions projectId={projectId} projectName={projectName} onClose={() => setShowInstructions(false)} />)}
      <div className="flex flex-col h-full bg-[#f5f0e8] dark:bg-[#0d0d0d] overflow-hidden">
        <div className="flex items-center gap-4 px-6 py-3 border-b-2 border-black dark:border-[#333] shrink-0">
          <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest text-[#ffcc00]">◈ Kanban</span>
          <span className="text-[#444] text-xs font-mono">— {projectName}</span>
          <span className="ml-auto text-[#444] text-xs font-mono">{tasks.length} tasks</span>
          <button onClick={() => { useKanbanStore.getState().syncFromServer(); }} className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 border border-[#ccc] dark:border-[#444] text-[#888] hover:text-[#ffcc00] hover:border-[#ffcc00]" type="button" title="Refresh">↻</button>
          <button onClick={() => setShowInstructions(true)} className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 border border-[#888] dark:border-[#555] text-[#888] hover:text-[#ffcc00] hover:border-[#ffcc00]" type="button" title="Agent instructions">?</button>
          <button onClick={() => setShowSetup(true)} className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 border border-[#ffcc00] text-[#ffcc00] hover:bg-[#ffcc00] hover:text-[#1a1a1a] ml-2" type="button">+ Connect Planka</button>
        </div>
        <div className="nexus-kanban-columns flex flex-1 min-h-0 gap-0 overflow-x-auto">
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);
            return (
              <div key={col.id} className={`nexus-kanban-column flex flex-col flex-1 min-w-[200px] border-r-2 border-black dark:border-[#222] transition-colors ${dragOverCol === col.id ? "bg-[#e8e3da] dark:bg-[#1a1a1a]" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) moveTask(id, col.id); setDragOverCol(null); }}>
                <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b-2 border-black dark:border-[#222]" style={{ background: col.bg, color: col.color }}>
                  <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest">{col.label}</span>
                  <span className="font-mono text-xs opacity-60">{colTasks.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                  {colTasks.map((task) => (
                    <div key={task.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; if (e.currentTarget instanceof HTMLElement) e.dataTransfer.setDragImage(e.currentTarget, 0, 0); }} className="group bg-white dark:bg-[#1a1a1a] border-2 border-black dark:border-[#333] p-2 cursor-grab active:cursor-grabbing hover:border-[#ffcc00] dark:hover:border-[#ffcc00] transition-colors">
                      {editingId === task.id ? (
                        <input className="w-full bg-transparent text-[#1a1a1a] dark:text-[#f5f0e8] font-['Space_Grotesk'] text-xs outline-none border-b border-[#ffcc00]" value={editText} autoFocus onChange={(e) => setEditText(e.target.value)} onBlur={() => { if (editText.trim()) updateTask(task.id, { title: editText.trim() }); setEditingId(null); }} onKeyDown={(e) => { if (e.key === "Enter") { if (editText.trim()) updateTask(task.id, { title: editText.trim() }); setEditingId(null); } if (e.key === "Escape") setEditingId(null); }} />
                      ) : (
                        <p className="text-[#1a1a1a] dark:text-[#f5f0e8] font-['Space_Grotesk'] text-xs leading-tight select-none" onDoubleClick={() => { setEditingId(task.id); setEditText(task.title); }} title="Double-click to edit">{task.title}</p>
                      )}
                      <div className="flex items-center justify-between mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-1.5 py-0.5 border border-gray-300 dark:border-[#333] text-gray-500 dark:text-[#888] hover:text-[#ffcc00] hover:border-[#ffcc00]" onClick={() => moveTask(task.id, nextStatus(task.status))} type="button">→ {nextStatus(task.status).replace("-", " ")}</button>
                        <button className="text-[9px] font-black text-gray-400 dark:text-[#444] hover:text-[#e63b2e] px-1" onClick={() => deleteTask(task.id)} type="button">✕</button>
                      </div>
                    </div>
                  ))}
                  {adding === col.id ? (
                    <div className="border-2 border-[#ffcc00] bg-white dark:bg-[#111] p-2">
                      <textarea className="w-full bg-transparent text-[#1a1a1a] dark:text-[#f5f0e8] font-['Space_Grotesk'] text-xs resize-none outline-none placeholder-gray-400 dark:placeholder-[#444] leading-tight" placeholder="Task title…" rows={2} autoFocus value={drafts[col.id]} onChange={(e) => setDrafts((d) => ({ ...d, [col.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(col.id); } if (e.key === "Escape") setAdding(null); }} />
                      <div className="flex gap-2 mt-1">
                        <button className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 bg-[#ffcc00] text-[#1a1a1a] hover:bg-[#f0c000]" onClick={() => handleAdd(col.id)} type="button">Add</button>
                        <button className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 text-[#555] hover:text-[#f5f0e8]" onClick={() => setAdding(null)} type="button">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="text-left text-[10px] font-['Space_Grotesk'] uppercase font-bold text-gray-400 dark:text-[#333] hover:text-[#ffcc00] dark:hover:text-[#ffcc00] border border-dashed border-gray-300 dark:border-[#2a2a2a] hover:border-[#ffcc00] dark:hover:border-[#ffcc00] p-2 transition-colors" onClick={() => setAdding(col.id)} type="button">+ Add task</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ── Confirm Delete Dialog ─────────────────────────────────────────────── */

interface ConfirmDelete {
  type: "card" | "list";
  id: string;
  name: string;
  listId?: string;
}

function ConfirmDialog({ item, onConfirm, onCancel, loading }: { item: ConfirmDelete; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#f5f0e8] dark:bg-[#1a1a1a] border-4 border-[#e63b2e] shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#333] w-full max-w-sm mx-4">
        <div className="px-4 py-3 border-b-2 border-[#e63b2e] bg-[#e63b2e] text-white">
          <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest">Delete {item.type}</span>
        </div>
        <div className="p-4">
          <p className="text-xs font-mono text-[#1a1a1a] dark:text-[#f5f0e8] mb-1">
            Are you sure you want to delete this {item.type}?
          </p>
          <p className="text-sm font-['Space_Grotesk'] font-bold text-[#1a1a1a] dark:text-[#f5f0e8] truncate">
            "{item.name}"
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onCancel} disabled={loading} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 border-2 border-black dark:border-[#333] text-[#1a1a1a] dark:text-[#f5f0e8] hover:bg-white dark:hover:bg-[#333] disabled:opacity-40" type="button">Cancel</button>
            <button onClick={onConfirm} disabled={loading} className="text-xs font-['Space_Grotesk'] font-black uppercase px-4 py-2 bg-[#e63b2e] text-white border-2 border-[#e63b2e] hover:bg-[#c53020] disabled:opacity-40" type="button">{loading ? "Deleting…" : "Delete"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Planka-connected board ────────────────────────────────────────────── */

interface PlankaBoardState {
  lists: PlankaList[];
  cardsByList: Record<string, PlankaCard[]>;
  loading: boolean;
  error: string;
}

function PlankaKanbanBoard({ projectId, projectName, config }: { projectId: string; projectName: string; config: PlankaConfig }) {
  const updateProject = useProjectStore((s) => s.updateProject);
  const [state, setState] = useState<PlankaBoardState>({ lists: [], cardsByList: {}, loading: true, error: "" });
  const [showSetup, setShowSetup] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [addingToListId, setAddingToListId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [addingList, setAddingList] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingCard, setCreatingCard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const loadedRef = useRef(false);

  const loadBoard = useCallback(async () => {
    if (!config?.token || !config?.selectedBoardId) return;
    setState(s => ({ ...s, loading: true, error: "" }));
    try {
      setPlankaConfig(config);
      const data = await plankaFetchAllBoardData(config.selectedBoardId);
      setState({ lists: data.lists, cardsByList: data.cardsByList, loading: false, error: "" });
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Failed to load board" }));
    }
  }, [config]);

  useEffect(() => {
    if (!loadedRef.current && config?.token) { loadedRef.current = true; loadBoard(); }
  }, [config?.token, config?.selectedBoardId, loadBoard]);

  const handleAddCard = async (listId: string) => {
    const title = draftTitle.trim();
    if (!title || !config?.selectedBoardId) return;
    setCreatingCard(true);
    try {
      setPlankaConfig(config);
      const card = await plankaCreateCard(listId, config.selectedBoardId, title);
      setState(s => ({ ...s, cardsByList: { ...s.cardsByList, [listId]: [...(s.cardsByList[listId] || []), card] } }));
      setDraftTitle("");
      setAddingToListId(null);
    } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : "Failed to create card" }));
    } finally {
      setCreatingCard(false);
    }
  };

  const handleMoveCard = async (cardId: string, fromListId: string, toListId: string) => {
    const card = state.cardsByList[fromListId]?.find(c => c.id === cardId);
    if (!card || fromListId === toListId) return;
    setState(s => ({
      ...s,
      cardsByList: {
        ...s.cardsByList,
        [fromListId]: (s.cardsByList[fromListId] || []).filter(c => c.id !== cardId),
        [toListId]: [...(s.cardsByList[toListId] || []), card],
      },
    }));
    try {
      setPlankaConfig(config);
      await plankaMoveCard(cardId, toListId, config.selectedBoardId!);
    } catch {
      loadBoard();
    }
  };

  const executeDeleteCard = async () => {
    if (!confirmDelete || confirmDelete.type !== "card") return;
    setDeleting(true);
    try {
      setPlankaConfig(config);
      await plankaDeleteCard(confirmDelete.id);
      setState(s => ({
        ...s,
        cardsByList: {
          ...s.cardsByList,
          [confirmDelete.listId!]: (s.cardsByList[confirmDelete.listId!] || []).filter(c => c.id !== confirmDelete.id),
        },
      }));
    } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : "Failed to delete card" }));
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const executeDeleteList = async () => {
    if (!confirmDelete || confirmDelete.type !== "list") return;
    setDeleting(true);
    try {
      setPlankaConfig(config);
      await plankaDeleteList(confirmDelete.id);
      setState(s => ({
        ...s,
        lists: s.lists.filter(l => l.id !== confirmDelete.id),
        cardsByList: Object.fromEntries(Object.entries(s.cardsByList).filter(([id]) => id !== confirmDelete.id)),
      }));
    } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : "Failed to delete list" }));
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const handleUpdateTitle = async (cardId: string, listId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    setState(s => ({ ...s, cardsByList: { ...s.cardsByList, [listId]: (s.cardsByList[listId] || []).map(c => c.id === cardId ? { ...c, name: newTitle } : c) } }));
    setEditingCardId(null);
    try {
      setPlankaConfig(config);
      await plankaUpdateCard(cardId, { name: newTitle, boardId: config.selectedBoardId });
    } catch { loadBoard(); }
  };

  const handleDisconnect = () => { updateProject(projectId, { planka: undefined } as Partial<Project>); };

  const handleReconnect = (data: { baseUrl: string; email: string; password: string; token: string; selectedProjectId: string; selectedProjectName: string; selectedBoardId: string; selectedBoardName: string }) => {
    updateProject(projectId, { planka: { baseUrl: data.baseUrl, email: data.email, password: data.password, token: data.token, selectedProjectId: data.selectedProjectId, selectedProjectName: data.selectedProjectName, selectedBoardId: data.selectedBoardId, selectedBoardName: data.selectedBoardName } });
    setShowSetup(false);
    loadedRef.current = false;
  };

  const handleCreateList = async () => {
    const name = newListName.trim();
    if (!name || !config?.selectedBoardId) return;
    setCreatingList(true);
    try {
      setPlankaConfig(config);
      const list = await plankaCreateList(config.selectedBoardId, name);
      setState(s => ({ ...s, lists: [...s.lists, list], cardsByList: { ...s.cardsByList, [list.id]: [] } }));
      setNewListName(""); setAddingList(false);
    } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : "Failed to create list" }));
    } finally { setCreatingList(false); }
  };

  const totalCards = Object.values(state.cardsByList).reduce((sum, cards) => sum + cards.length, 0);

  return (
    <>
      {showSetup && (<PlankaSetup projectId={projectId} projectName={projectName} initialConfig={{ baseUrl: config?.baseUrl, email: config?.email, selectedProjectId: config?.selectedProjectId, selectedBoardId: config?.selectedBoardId }} onConnect={handleReconnect} onCancel={() => setShowSetup(false)} />)}
      {showInstructions && (<PlankaInstructions config={config} onClose={() => setShowInstructions(false)} />)}
      {confirmDelete && (
        <ConfirmDialog
          item={confirmDelete}
          onConfirm={confirmDelete.type === "card" ? executeDeleteCard : executeDeleteList}
          onCancel={() => setConfirmDelete(null)}
          loading={deleting}
        />
      )}

      <div className="flex flex-col h-full bg-[#f5f0e8] dark:bg-[#0d0d0d] overflow-hidden">
        <div className="flex items-center gap-4 px-6 py-3 border-b-2 border-black dark:border-[#333] shrink-0">
          <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest text-[#ffcc00]">◈ Planka</span>
          <span className="text-[#444] text-xs font-mono">— {config?.selectedProjectName || projectName}<span className="text-[#666] mx-1">/</span>{config?.selectedBoardName || projectName}</span>
          <span className="px-1.5 py-0.5 text-[9px] font-mono bg-[#ffcc00] text-[#1a1a1a] uppercase font-bold">Planka</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[#444] text-xs font-mono">{totalCards} cards</span>
            <button onClick={() => setShowInstructions(true)} className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 border border-[#888] dark:border-[#555] text-[#888] hover:text-[#ffcc00] hover:border-[#ffcc00]" type="button" title="Agent instructions">?</button>
            <button onClick={() => loadBoard()} className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 border border-[#ccc] dark:border-[#444] text-[#888] hover:text-[#ffcc00] hover:border-[#ffcc00]" type="button" title="Refresh">↻</button>
            <button onClick={() => setShowSetup(true)} className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 border border-[#ddd] dark:border-[#444] text-[#888] hover:text-[#ffcc00] hover:border-[#ffcc00]" type="button">Change Board</button>
            <button onClick={handleDisconnect} className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 border border-[#ddd] dark:border-[#444] text-[#888] hover:text-[#e63b2e] hover:border-[#e63b2e]" type="button">Disconnect</button>
          </div>
        </div>

        {state.error && (
          <div className="mx-6 mt-2 border-2 border-[#e63b2e] bg-[#e63b2e]/10 text-[#e63b2e] p-2 text-xs font-mono flex items-center justify-between">
            <span>{state.error}</span>
            <button onClick={() => setState(s => ({ ...s, error: "" }))} className="text-[#e63b2e] font-black ml-2" type="button">✕</button>
          </div>
        )}

        {state.loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs font-mono text-[#888] animate-pulse">Loading board from Planka…</p>
          </div>
        ) : (
          <div className="nexus-kanban-columns flex flex-1 min-h-0 gap-0 overflow-x-auto">
            {state.lists.map((list) => {
              const cards = state.cardsByList[list.id] || [];
              return (
                <div key={list.id} className="nexus-kanban-column flex flex-col flex-1 min-w-[220px] border-r-2 border-black dark:border-[#222]">
                  <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b-2 border-black dark:border-[#222] bg-[#1a1a1a]">
                    <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest text-[#f5f0e8]">{list.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs text-[#888]">{cards.length}</span>
                      <button className="text-[10px] text-[#666] hover:text-[#e63b2e] px-0.5 ml-1 leading-none" onClick={() => setConfirmDelete({ type: "list", id: list.id, name: list.name })} title="Delete list" type="button">✕</button>
                    </div>
                  </div>

                  <div
                    className="flex-1 overflow-y-auto p-2 flex flex-col gap-2"
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      try {
                        const data = JSON.parse(e.dataTransfer.getData("application/planka-card"));
                        if (data.cardId && data.listId !== list.id) handleMoveCard(data.cardId, data.listId, list.id);
                      } catch { /* ignore */ }
                    }}
                  >
                    {cards.map((card) => (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/planka-card", JSON.stringify({ cardId: card.id, listId: list.id }));
                          e.dataTransfer.effectAllowed = "move";
                          if (e.currentTarget instanceof HTMLElement) e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
                        }}
                        className="group bg-white dark:bg-[#1a1a1a] border-2 border-black dark:border-[#333] p-3 cursor-grab active:cursor-grabbing hover:border-[#ffcc00] dark:hover:border-[#ffcc00] transition-colors"
                      >
                        {editingCardId === card.id ? (
                          <input className="w-full bg-transparent text-[#1a1a1a] dark:text-[#f5f0e8] font-['Space_Grotesk'] text-xs outline-none border-b border-[#ffcc00]" value={editText} autoFocus onChange={(e) => setEditText(e.target.value)} onBlur={() => handleUpdateTitle(card.id, list.id, editText)} onKeyDown={(e) => { if (e.key === "Enter") handleUpdateTitle(card.id, list.id, editText); if (e.key === "Escape") setEditingCardId(null); }} />
                        ) : (
                          <>
                            <p className="text-[#1a1a1a] dark:text-[#f5f0e8] font-['Space_Grotesk'] text-xs leading-tight select-none" onDoubleClick={() => { setEditingCardId(card.id); setEditText(card.name); }} title="Double-click to edit">{card.name}</p>
                            {card.description && (
                              <p className="text-[10px] font-mono text-[#888] dark:text-[#666] mt-1 line-clamp-2">{card.description}</p>
                            )}
                          </>
                        )}
                        <div className="flex items-center justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="text-[9px] font-black text-gray-400 dark:text-[#444] hover:text-[#e63b2e] px-1" onClick={() => setConfirmDelete({ type: "card", id: card.id, name: card.name, listId: list.id })} title="Delete card" type="button">✕</button>
                        </div>
                      </div>
                    ))}

                    {addingToListId === list.id ? (
                      <div className="border-2 border-[#ffcc00] bg-white dark:bg-[#111] p-2">
                        <textarea className="w-full bg-transparent text-[#1a1a1a] dark:text-[#f5f0e8] font-['Space_Grotesk'] text-xs resize-none outline-none placeholder-gray-400 dark:placeholder-[#444] leading-tight" placeholder="Card title…" rows={2} autoFocus value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddCard(list.id); } if (e.key === "Escape") { setAddingToListId(null); setDraftTitle(""); } }} />
                        <div className="flex gap-2 mt-1">
                          <button className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 bg-[#ffcc00] text-[#1a1a1a] hover:bg-[#f0c000]" onClick={() => handleAddCard(list.id)} disabled={creatingCard} type="button">{creatingCard ? "Adding…" : "Add"}</button>
                          <button className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 text-[#555] hover:text-[#f5f0e8]" onClick={() => { setAddingToListId(null); setDraftTitle(""); }} type="button">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button className="text-left text-[10px] font-['Space_Grotesk'] uppercase font-bold text-gray-400 dark:text-[#333] hover:text-[#ffcc00] dark:hover:text-[#ffcc00] border border-dashed border-gray-300 dark:border-[#2a2a2a] hover:border-[#ffcc00] dark:hover:border-[#ffcc00] p-2 transition-colors" onClick={() => setAddingToListId(list.id)} type="button">+ Add card</button>
                    )}
                  </div>
                </div>
              );
            })}

            {addingList ? (
              <div className="nexus-kanban-column flex flex-col w-[220px] shrink-0 border-r-2 border-black dark:border-[#222]">
                <div className="flex items-center px-3 py-2 shrink-0 border-b-2 border-black dark:border-[#222] bg-[#1a1a1a]">
                  <span className="font-['Space_Grotesk'] font-black text-xs uppercase tracking-widest text-[#888]">New List</span>
                </div>
                <div className="flex-1 p-2 border-2 border-[#ffcc00] bg-white dark:bg-[#111]">
                  <input className="w-full bg-transparent text-[#1a1a1a] dark:text-[#f5f0e8] font-['Space_Grotesk'] text-xs outline-none border-b border-[#ffcc00] pb-1" placeholder="List name…" autoFocus value={newListName} onChange={(e) => setNewListName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateList(); if (e.key === "Escape") { setAddingList(false); setNewListName(""); } }} />
                  <div className="flex gap-2 mt-2">
                    <button className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 bg-[#ffcc00] text-[#1a1a1a] hover:bg-[#f0c000] disabled:opacity-40" onClick={handleCreateList} disabled={creatingList} type="button">{creatingList ? "Creating…" : "Create"}</button>
                    <button className="text-[9px] font-['Space_Grotesk'] font-black uppercase px-2 py-1 text-[#555] hover:text-[#f5f0e8]" onClick={() => { setAddingList(false); setNewListName(""); }} type="button">Cancel</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-[220px] shrink-0 p-3 flex items-start">
                <button className="text-left text-[10px] font-['Space_Grotesk'] uppercase font-bold text-gray-400 dark:text-[#333] hover:text-[#ffcc00] dark:hover:text-[#ffcc00] border border-dashed border-gray-300 dark:border-[#444] hover:border-[#ffcc00] dark:hover:border-[#ffcc00] p-2 w-full transition-colors" onClick={() => setAddingList(true)} type="button">+ Add list</button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
