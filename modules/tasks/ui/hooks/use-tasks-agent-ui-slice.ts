import type { JsonValue } from "@engenty/ag-ui-bridge";
import {
  type AgentUiStateSlice,
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";
import type {
  Goal,
  Task,
  TaskDetail,
  TasksBriefingResponse,
} from "../../src/schema/types.js";
import {
  buildBriefingSnapshot,
  buildGoalsPreview,
  buildTaskSnapshot,
  buildTasksPreview,
} from "../copilot-snapshot.js";

interface RoutineListItem {
  enabled: boolean;
  id: string;
  name: string;
}

interface InboxNotificationListItem {
  id: string;
  kind: string;
  summary: string;
}

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
        goal_id: task.goal_id ?? null,
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

export function useTasksGoalsListAgentUiSlice(input: {
  goals: Goal[];
  search: string;
}) {
  const slice = useMemo(() => {
    const preview = buildGoalsPreview(input.goals);
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Goals",
          page_description: input.search.trim()
            ? `Goals list filtered by search (${input.goals.length} visible).`
            : `Goals list (${input.goals.length} visible).`,
          list_search: input.search,
          list_total: input.goals.length,
          list_preview: preview as unknown as JsonValue[],
        }),
        ...(preview.length > 0 ? { goals_preview: preview } : {}),
      },
    };
  }, [input.goals, input.search]);

  useRegisterAgentUiSlice("tasks.goals", slice as AgentUiStateSlice);
}

export function useTasksGoalDetailAgentUiSlice(input: {
  goal: Goal | null;
  linkedTasks: Task[];
}) {
  const slice = useMemo(() => {
    if (!input.goal) {
      return null;
    }
    const preview = buildTasksPreview(input.linkedTasks);
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: input.goal.title,
          page_description: `Viewing goal "${input.goal.title}" (status ${input.goal.status}) with ${input.linkedTasks.length} linked task(s).`,
          list_total: input.linkedTasks.length,
        }),
        goal_id: input.goal.id,
        goal_status: input.goal.status,
        goal_title: input.goal.title,
        ...(preview.length > 0 ? { tasks_preview: preview } : {}),
      },
      selection: {
        entity_id: input.goal.id,
        entity_type: "goal",
      },
    };
  }, [input.goal, input.linkedTasks]);

  useRegisterAgentUiSlice(
    "tasks.goal-detail",
    slice as AgentUiStateSlice | null
  );
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

export function useTasksRoutinesListAgentUiSlice(input: {
  enabledFilter: string;
  routines: RoutineListItem[];
  search: string;
}) {
  const slice = useMemo(() => {
    const preview = input.routines.slice(0, 10).map((r) => ({
      id: r.id,
      label: r.name,
      enabled: r.enabled,
    }));
    const filters: Record<string, string> = {};
    if (input.enabledFilter && input.enabledFilter !== "all") {
      filters.enabled = input.enabledFilter;
    }
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Routines",
          page_description: `Tasks routines list (${input.routines.length} visible).`,
          list_search: input.search,
          list_filters: filters,
          list_total: input.routines.length,
          list_preview: preview,
        }),
      },
    };
  }, [input.enabledFilter, input.routines, input.search]);

  useRegisterAgentUiSlice("tasks.routines", slice as AgentUiStateSlice);
}

export function useTasksRoutineDetailAgentUiSlice(
  routine: RoutineListItem | null
) {
  const slice = useMemo(() => {
    if (!routine) {
      return null;
    }
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: routine.name,
          page_description: `Viewing routine "${routine.name}" (${routine.enabled ? "enabled" : "disabled"}).`,
        }),
        routine_id: routine.id,
        routine_name: routine.name,
        routine_enabled: routine.enabled,
      },
      selection: {
        entity_id: routine.id,
        entity_type: "routine",
      },
    };
  }, [routine]);

  useRegisterAgentUiSlice(
    "tasks.routine-detail",
    slice as AgentUiStateSlice | null
  );
}

export function useTasksRoutineEditAgentUiSlice(
  routine: RoutineListItem | null
) {
  const slice = useMemo(() => {
    if (!routine) {
      return null;
    }
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "edit",
          page_title: routine.name,
          page_description: `Editing custom routine "${routine.name}".`,
        }),
        routine_id: routine.id,
        routine_name: routine.name,
      },
      selection: {
        entity_id: routine.id,
        entity_type: "routine",
      },
    };
  }, [routine]);

  useRegisterAgentUiSlice(
    "tasks.routine-edit",
    slice as AgentUiStateSlice | null
  );
}

export function useTasksOperationsAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "operations",
          page_title: "Tasks operations",
          page_description:
            "Operations cockpit for active goals, dispatch status, and unplanned tasks.",
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

export function useTasksInboxAgentUiSlice(input: {
  kindFilter: string;
  notifications: InboxNotificationListItem[];
  search: string;
}) {
  const slice = useMemo(() => {
    const preview = input.notifications.slice(0, 10).map((n) => ({
      id: n.id,
      label: n.summary,
      kind: n.kind,
    }));
    const filters: Record<string, string> = {};
    if (input.kindFilter && input.kindFilter !== "all") {
      filters.kind = input.kindFilter;
    }
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Tasks inbox",
          page_description: `Tasks team inbox (${input.notifications.length} notification(s) visible).`,
          list_search: input.search,
          list_filters: filters,
          list_total: input.notifications.length,
          list_preview: preview,
        }),
      },
    };
  }, [input.kindFilter, input.notifications, input.search]);

  useRegisterAgentUiSlice("tasks.inbox", slice as AgentUiStateSlice);
}
