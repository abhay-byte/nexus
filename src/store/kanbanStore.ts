import { create } from "zustand";
import { nanoid } from "nanoid";

const BASE = "http://127.0.0.1:7878";

export type KanbanStatus = "todo" | "in-progress" | "done" | "blocked";

export interface KanbanTask {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: KanbanStatus;
  color?: string;
  createdAt: number;
}

interface KanbanStore {
  tasks: KanbanTask[];
  addTask: (projectId: string, status: KanbanStatus, title: string) => Promise<void>;
  updateTask: (id: string, patch: Partial<Omit<KanbanTask, "id" | "projectId">>) => Promise<void>;
  moveTask: (id: string, status: KanbanStatus) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  tasksForProject: (projectId: string) => KanbanTask[];
  syncFromServer: () => Promise<void>;
}

const convert = (raw: any): KanbanTask => ({
  id: raw.id,
  projectId: raw.project_id,
  title: raw.title || "",
  description: raw.description || undefined,
  status: raw.status as KanbanStatus,
  color: raw.color || undefined,
  createdAt: Date.now(),
});

export const useKanbanStore = create<KanbanStore>()((set, get) => ({
  tasks: [],

  addTask: async (projectId, status, title) => {
    const id = nanoid();
    await fetch(`${BASE}/api/kanban/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, project_id: projectId, title: title.trim(), status }),
    });
    await get().syncFromServer();
  },

  updateTask: async (id, patch) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    await fetch(`${BASE}/api/kanban/tasks/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, project_id: task.projectId, title: patch.title ?? task.title, description: patch.description ?? task.description, status: patch.status ?? task.status, color: patch.color ?? task.color }),
    });
    await get().syncFromServer();
  },

  moveTask: async (id, status) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    await fetch(`${BASE}/api/kanban/tasks/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, project_id: task.projectId, title: task.title, description: task.description, status, color: task.color }),
    });
    await get().syncFromServer();
  },

  deleteTask: async (id) => {
    await fetch(`${BASE}/api/kanban/tasks/${id}`, { method: "DELETE" });
    await get().syncFromServer();
  },

  tasksForProject: (projectId) => get().tasks.filter((t) => t.projectId === projectId),

  syncFromServer: async () => {
    try {
      const resp = await fetch(`${BASE}/api/kanban/tasks`);
      if (!resp.ok) return;
      const raw = await resp.json();
      set({ tasks: (raw || []).map(convert) });
    } catch { /* offline */ }
  },
}));

// ── Force-clear stale persist data (for HMR / restart) ─────────────────────
// Old zustand persist middleware stored under "nexus-kanban" key.
// HMR doesn't clear localStorage or in-memory state.
try { localStorage.removeItem("nexus-kanban"); } catch {}
// Reset in-memory store to empty and sync from server
useKanbanStore.setState({ tasks: [] });
useKanbanStore.getState().syncFromServer();

export const KANBAN_COLUMNS: { id: KanbanStatus; label: string; color: string; bg: string }[] = [
  { id: "todo",        label: "TODO",        color: "#f5f0e8", bg: "#1a1a1a" },
  { id: "in-progress", label: "IN PROGRESS", color: "#1a1a1a", bg: "#ffcc00" },
  { id: "done",        label: "DONE",        color: "#f5f0e8", bg: "#10b981" },
  { id: "blocked",     label: "BLOCKED",     color: "#f5f0e8", bg: "#e63b2e" },
];
