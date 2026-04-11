import { nanoid } from "nanoid";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { PROJECT_SWATCHES } from "../constants/agents";
import { loadProjects, saveProjects } from "../lib/persistence";
import type { AddProjectDraft, Project } from "../types";

interface ProjectStoreState {
  projects: Project[];
  openProjectIds: string[];
  activeProjectId: string | null;
  bootstrapped: boolean;
  loading: boolean;
  isAddProjectOpen: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  openAddProject: () => void;
  closeAddProject: () => void;
  addProject: (draft: AddProjectDraft) => Promise<void>;
  removeProject: (projectId: string) => Promise<void>;
  setActiveProject: (projectId: string) => void;
  closeProjectTab: (projectId: string) => void;
  hydrateWorkspace: (openProjectIds: string[], activeProjectId: string | null) => void;
}

const syncProjectsToDisk = async (projects: Project[]) => {
  await saveProjects(projects);
};

export const useProjectStore = create<ProjectStoreState>()(
  subscribeWithSelector((set, get) => ({
    projects: [],
    openProjectIds: [],
    activeProjectId: null,
    bootstrapped: false,
    loading: false,
    isAddProjectOpen: false,
    error: null,
    initialize: async () => {
      if (get().bootstrapped || get().loading) {
        return;
      }

      set({ loading: true, error: null });

      try {
        const projects = await loadProjects();
        const fallbackOpen = projects[0] ? [projects[0].id] : [];

        set({
          projects,
          openProjectIds: fallbackOpen,
          activeProjectId: fallbackOpen[0] ?? null,
          bootstrapped: true,
          loading: false,
        });
      } catch (error) {
        set({
          loading: false,
          bootstrapped: true,
          error:
            error instanceof Error
              ? error.message
              : "Failed to load projects from disk.",
        });
      }
    },
    openAddProject: () => set({ isAddProjectOpen: true }),
    closeAddProject: () => set({ isAddProjectOpen: false }),
    addProject: async (draft) => {
      const project: Project = {
        id: nanoid(),
        name: draft.name.trim(),
        path: draft.path.trim(),
        color: draft.color || PROJECT_SWATCHES[0],
        defaultAgents: draft.defaultAgents,
        createdAt: Date.now(),
      };

      const projects = [...get().projects, project].sort(
        (left, right) => left.createdAt - right.createdAt,
      );

      set((state) => ({
        projects,
        openProjectIds: state.openProjectIds.includes(project.id)
          ? state.openProjectIds
          : [...state.openProjectIds, project.id],
        activeProjectId: project.id,
        isAddProjectOpen: false,
        error: null,
      }));

      await syncProjectsToDisk(projects);
    },
    removeProject: async (projectId) => {
      const projects = get().projects.filter((project) => project.id !== projectId);
      const openProjectIds = get().openProjectIds.filter((id) => id !== projectId);
      const activeProjectId =
        get().activeProjectId === projectId
          ? openProjectIds[0] ?? projects[0]?.id ?? null
          : get().activeProjectId;

      set({ projects, openProjectIds, activeProjectId });
      await syncProjectsToDisk(projects);
    },
    setActiveProject: (projectId) =>
      set((state) => ({
        activeProjectId: projectId,
        openProjectIds: state.openProjectIds.includes(projectId)
          ? state.openProjectIds
          : [...state.openProjectIds, projectId],
      })),
    closeProjectTab: (projectId) =>
      set((state) => {
        const openProjectIds = state.openProjectIds.filter((id) => id !== projectId);
        const activeProjectId =
          state.activeProjectId === projectId
            ? openProjectIds[0] ?? null
            : state.activeProjectId;

        return {
          openProjectIds,
          activeProjectId,
        };
      }),
    hydrateWorkspace: (openProjectIds, activeProjectId) =>
      set((state) => {
        const knownProjectIds = new Set(state.projects.map((project) => project.id));
        const filteredOpen = openProjectIds.filter((projectId) => knownProjectIds.has(projectId));
        const nextActive =
          activeProjectId && knownProjectIds.has(activeProjectId)
            ? activeProjectId
            : filteredOpen[0] ?? state.projects[0]?.id ?? null;

        return {
          openProjectIds: filteredOpen.length > 0 ? filteredOpen : nextActive ? [nextActive] : [],
          activeProjectId: nextActive,
        };
      }),
  })),
);
