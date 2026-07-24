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

export function useTasksDetailAgentUiSlice(task: Task | null) {
  const slice = useMemo(() => {
    if (!task) {
      return null;
    }
    const titleHint = task.title?.trim() ?? "";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: titleHint || "Task",
          page_description: "Task detail page.",
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
          page_description: "Tasks list.",
          list_search: q,
          list_total: input.tasks.length,
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
          page_description: "Goals list.",
          list_search: input.search,
          list_total: input.goals.length,
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
          page_description: "Goal detail with linked tasks.",
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
          page_description: `Tasks briefing (${input.mode}).`,
        }),
        briefing_mode: input.mode,
        tasks_briefing_snapshot: buildBriefingSnapshot(input.snapshot),
      },
    };
  }, [input.mode, input.snapshot]);

  useRegisterAgentUiSlice("tasks.briefing", slice as AgentUiStateSlice | null);
}
