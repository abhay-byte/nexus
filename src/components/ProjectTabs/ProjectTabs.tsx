import type { Project } from "../../types";

interface ProjectTabsProps {
  projects: Project[];
  activeProjectId: string | null;
  openProjectIds: string[];
  projectAttention: Record<string, number>;
  projectCounts: Record<string, number>;
  onSelectProject: (projectId: string) => void;
  onCloseProject: (projectId: string) => void;
  onAddProject: () => void;
}

export function ProjectTabs({
  projects,
  activeProjectId,
  openProjectIds,
  projectAttention,
  projectCounts,
  onSelectProject,
  onCloseProject,
  onAddProject,
}: ProjectTabsProps) {
  const openProjects = openProjectIds
    .map((projectId) => projects.find((project) => project.id === projectId))
    .filter((project): project is Project => Boolean(project));

  return (
    <div className="project-tabs">
      {openProjects.length === 0 ? (
        <span className="project-tabs__placeholder">No project opened</span>
      ) : (
        openProjects.map((project) => (
          <button
            className={`project-tab${project.id === activeProjectId ? " project-tab--active" : ""}`}
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            type="button"
            style={{ ["--project-accent" as string]: project.color }}
          >
            <span className="project-tab__dot" />
            {project.name}
            <span className="project-tab__count">{projectCounts[project.id] ?? 0}</span>
            {projectAttention[project.id] ? (
              <span className="project-tab__badge">{projectAttention[project.id]}</span>
            ) : null}
            <span
              className="project-tab__close"
              onClick={(event) => {
                event.stopPropagation();
                onCloseProject(project.id);
              }}
              role="button"
              tabIndex={0}
            >
              ×
            </span>
          </button>
        ))
      )}
      <button className="project-tab project-tab--add" onClick={onAddProject} type="button">
        +
      </button>
    </div>
  );
}
