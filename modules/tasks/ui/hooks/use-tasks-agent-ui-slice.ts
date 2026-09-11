import type { JsonValue } from "@engenty/ag-ui-bridge";
import {
  type AgentUiStateSlice,
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";
import type {
  Task,
  TaskDetail,
  TasksBriefingResponse,
} from "../../src/schema/types.js";
import {
  buildBriefingSnapshot,
  buildTaskSnapshot,
  buildTasksPreview,
} from "../copilot-snapshot.js";

export function useTasksDetailAgentUiSlice(task: Task | null) {
  const slice = useMemo(() => {
    if (!task) {
      return null;
    }
    const titleHint = task.title?.trim() ?? "";
    const status = task.status?.trim();
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: titleHint || "Task",
          page_description: titleHint
            ? `Viewing task "${titleHint}"${status ? ` (status ${status})` : ""}.`
            : "Viewing a task.",
        }),
        ...(titleHint ? { task_title: titleHint } : {}),
        task_snapshot: buildTaskSnapshot(task as TaskDetail),
      },
      selection: {
        entity_id: task.id,
        entity_type: "task",
      },
    };
  }, [task]);

  useRegisterAgentUiSlice("tasks_detail", slice as AgentUiStateSlice | null);
}

export function useTasksListAgentUiSlice(input: {
  search: string;
  tasks: Task[];
}) {
  const slice = useMemo(() => {
    const q = input.search.trim();
    const preview = buildTasksPreview(input.tasks);
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Tasks",
          page_description: q
            ? `Tasks list filtered by search (${input.tasks.length} visible).`
            : `Tasks list (${input.tasks.length} visible).`,
          list_search: q,
          list_total: input.tasks.length,
          list_preview: preview as unknown as JsonValue[],
        }),
        ...(preview.length > 0 ? { tasks_preview: preview } : {}),
      },
    };
  }, [input.search, input.tasks]);

  useRegisterAgentUiSlice("tasks_list", slice as AgentUiStateSlice);
}

export function useTasksBriefingAgentUiSlice(input: {
  mode: string;
  snapshot: TasksBriefingResponse | null;
}) {
  const slice = useMemo(() => {
    if (!input.snapshot) {
      return null;
    }
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "briefing",
          page_title: "Tasks briefing",
          page_description: `Tasks briefing view (${input.mode}).`,
        }),
        briefing_mode: input.mode,
        tasks_briefing_snapshot: buildBriefingSnapshot(input.snapshot),
      },
    };
  }, [input.mode, input.snapshot]);

  useRegisterAgentUiSlice("tasks.briefing", slice as AgentUiStateSlice | null);
}

export function useTasksOperationsAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "operations",
          page_title: "Tasks operations",
          page_description:
            "Operations cockpit for agent work and dispatch status.",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("tasks.operations", slice as AgentUiStateSlice);
}

export function useTasksSettingsAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Tasks settings",
          page_description:
            "Tasks module settings (identifier prefix, statuses, stale threshold).",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("tasks.settings", slice as AgentUiStateSlice);
}
