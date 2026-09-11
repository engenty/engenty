/**
 * Projects' tab on the cross-space work overview Tasks owns (`/work`).
 */
import { formatWorkDate, type WorkTab } from "@engenty/tasks/ui/work-tabs";
import { getProjects, type ProjectListItem } from "./api.js";

/** The list route's page maximum. */
const PAGE_SIZE = 200;

/** A project inside its space — the mirrored form of `/mdl/projects/<id>`. */
function projectPathInSpace(spaceKey: string, projectId: string): string {
  return `/s/${encodeURIComponent(spaceKey)}/projects/${encodeURIComponent(projectId)}`;
}

export const projectsWorkTab: WorkTab<ProjectListItem> = {
  columns: [
    {
      className: "max-w-0 truncate",
      key: "title",
      label: "Title",
      labelKey: "projects:work.columns.title",
      link: true,
      render: (project) => project.title,
    },
    {
      className: "w-48 text-xs",
      key: "client",
      label: "Client",
      labelKey: "projects:work.columns.client",
      render: (project) => project.client_name ?? "",
    },
    {
      className: "w-32 text-xs",
      key: "start",
      label: "Start",
      labelKey: "projects:work.columns.start",
      render: (project) => formatWorkDate(project.start_date),
    },
    {
      className: "w-32 text-xs",
      key: "end",
      label: "End",
      labelKey: "projects:work.columns.end",
      render: (project) => formatWorkDate(project.end_date),
    },
  ],
  href: (project, spaceKey) => projectPathInSpace(spaceKey, project.id),
  id: "projects",
  label: "Projects",
  labelKey: "projects:menu.projects",
  load: async ({ spaceId }, signal) => {
    const page = await getProjects(
      {
        pageSize: PAGE_SIZE,
        sortBy: "created_at",
        sortOrder: "desc",
        ...(spaceId ? { space_id: spaceId } : {}),
      },
      signal
    );
    return { rows: page.data, total: page.total };
  },
  order: 20,
  rowKey: (project) => project.id,
  spaceIdOf: (project) => project.space_id ?? null,
};
