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
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title || "Project",
          page_description: "Project detail page.",
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
}) {
  const slice = useMemo(() => {
    const q = input.search.trim();
    const preview = input.projects.slice(0, 10).map((p) => ({
      client_name: p.client_name,
      end_date: p.end_date,
      id: p.id,
      start_date: p.start_date,
      title: p.title,
    }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Projects",
          page_description: "Projects list.",
          list_search: q,
          list_total: input.projects.length,
        }),
        ...(preview.length > 0 ? { projects_preview: preview } : {}),
      },
    };
  }, [input.projects, input.search]);

  useRegisterAgentUiSlice("projects_list", slice);
}

export function useProjectsBriefingAgentUiSlice(input: {
  briefingSnapshot: unknown;
  mode: string;
}) {
  const slice = useMemo(() => {
    if (input.briefingSnapshot == null) {
      return null;
    }
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "briefing",
          page_title: "Projects briefing",
          page_description: `Projects briefing (${input.mode}).`,
        }),
        briefing_view: input.mode,
        projects_briefing_snapshot: input.briefingSnapshot,
      },
    };
  }, [input.briefingSnapshot, input.mode]);

  useRegisterAgentUiSlice("projects.briefing", slice);
}
