import { create } from "zustand";
import { nanoid } from "nanoid";
import { persist } from "zustand/middleware";
import { isTauri, httpApi } from "../lib/api";

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
  addTask: (projectId: string, status: KanbanStatus, title: string) => void;
  updateTask: (id: string, patch: Partial<Omit<KanbanTask, "id" | "projectId">>) => void;
  moveTask: (id: string, status: KanbanStatus) => void;
  deleteTask: (id: string) => void;
  tasksForProject: (projectId: string) => KanbanTask[];
  syncFromServer: () => Promise<void>;
}

export const useKanbanStore = create<KanbanStore>()(
  persist(
    (set, get) => ({
      tasks: [],

      addTask: (projectId, status, title) => {
        const task: KanbanTask = { id: nanoid(), projectId, title: title.trim(), status, createdAt: Date.now() };
        set((state) => ({ tasks: [...state.tasks, task] }));
        if (!isTauri()) {
          httpApi.post("/api/kanban/tasks", {
            id: task.id,
            project_id: projectId,
            title: task.title,
            status,
          }).catch(console.error);
        }
      },

      updateTask: (id, patch) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }));
        if (!isTauri()) {
          const task = get().tasks.find((t) => t.id === id);
          if (task) {
            httpApi.put(`/api/kanban/tasks/${id}`, {
              id: task.id,
              project_id: task.projectId,
              title: patch.title ?? task.title,
              description: patch.description ?? task.description,
              status: patch.status ?? task.status,
              color: patch.color ?? task.color,
            }).catch(console.error);
          }
        }
      },

      moveTask: (id, status) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
        }));
        if (!isTauri()) {
          const task = get().tasks.find((t) => t.id === id);
          if (task) {
            httpApi.put(`/api/kanban/tasks/${id}`, {
              id: task.id,
              project_id: task.projectId,
              title: task.title,
              description: task.description,
              status,
              color: task.color,
            }).catch(console.error);
          }
        }
      },

      deleteTask: (id) => {
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
        if (!isTauri()) {
          httpApi.del(`/api/kanban/tasks/${id}`).catch(console.error);
        }
      },

      tasksForProject: (projectId) =>
        get().tasks.filter((t) => t.projectId === projectId),

      syncFromServer: async () => {
        if (isTauri()) return;
        try {
          const tasks = await httpApi.get<KanbanTask[]>("/api/kanban/tasks");
          set({ tasks });
        } catch (e) {
          console.error("Failed to sync kanban from server:", e);
        }
      },
    }),
    { name: "nexus-kanban" },
  ),
);

export const KANBAN_COLUMNS: { id: KanbanStatus; label: string; color: string; bg: string }[] = [
  { id: "todo",        label: "TODO",        color: "#f5f0e8", bg: "#1a1a1a" },
  { id: "in-progress", label: "IN PROGRESS", color: "#1a1a1a", bg: "#ffcc00" },
  { id: "done",        label: "DONE",        color: "#f5f0e8", bg: "#10b981" },
  { id: "blocked",     label: "BLOCKED",     color: "#f5f0e8", bg: "#e63b2e" },
];
