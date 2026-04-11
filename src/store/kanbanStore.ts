import { create } from "zustand";
import { nanoid } from "nanoid";
import { persist } from "zustand/middleware";

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
}

export const useKanbanStore = create<KanbanStore>()(
  persist(
    (set, get) => ({
      tasks: [],

      addTask: (projectId, status, title) =>
        set((state) => ({
          tasks: [
            ...state.tasks,
            { id: nanoid(), projectId, title: title.trim(), status, createdAt: Date.now() },
          ],
        })),

      updateTask: (id, patch) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      moveTask: (id, status) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
        })),

      deleteTask: (id) =>
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

      tasksForProject: (projectId) =>
        get().tasks.filter((t) => t.projectId === projectId),
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
