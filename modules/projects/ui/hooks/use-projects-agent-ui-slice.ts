import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";
import type { ProjectWithPhasesAndTasks } from "../api.js";
import { buildProjectSnapshot } from "../copilot-snapshot.js";

interface ProjectListItem {
  client_name: string | null;
  end_date: string | null;
  id: string;
  start_date: string | null;
  title: string;
}

export function useProjectsDetailAgentUiSlice(input: {
  entityId: string | null;
  project: ProjectWithPhasesAndTasks | null | undefined;
}) {
  const slice = useMemo(() => {
    if (!(input.entityId && input.project)) {
      return null;
    }
    const title = input.project.title?.trim() ?? "";
    const client = input.project.client_name?.trim();
    const phaseCount = input.project.phases?.length ?? 0;
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title || "Project",
          page_description: title
            ? `Viewing project "${title}"${client ? ` for ${client}` : ""} (${phaseCount} phase(s)).`
            : "Viewing a project.",
        }),
        project_snapshot: buildProjectSnapshot(input.project),
        ...(title ? { project_title: title } : {}),
      },
      selection: {
        entity_id: input.entityId,
        entity_type: "project",
      },
    };
  }, [input.entityId, input.project]);

  useRegisterAgentUiSlice("projects.detail", slice);
}

export function useProjectsListAgentUiSlice(input: {
  projects: ProjectListItem[];
  search: string;
  space_id?: string;
}) {
  const slice = useMemo(() => {
    const q = input.search.trim();
    const preview = input.projects.slice(0, 10).map((p) => ({
      client_name: p.client_name,
      end_date: p.end_date,
      id: p.id,
      label: p.title,
      start_date: p.start_date,
      title: p.title,
    }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Projects",
          page_description: q
            ? `Projects list filtered by search (${input.projects.length} visible).`
            : `Projects list (${input.projects.length} visible).`,
          list_search: q,
          list_total: input.projects.length,
          list_preview: preview,
        }),
        ...(preview.length > 0 ? { projects_preview: preview } : {}),
        ...(input.space_id ? { space_id: input.space_id } : {}),
      },
    };
  }, [input.projects, input.search, input.space_id]);

  useRegisterAgentUiSlice("projects_list", slice);
}

export function useProjectsSettingsAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Projects settings",
          page_description: "Projects module settings (statuses and defaults).",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("projects.settings", slice);
}
