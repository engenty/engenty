import type { AgentDefinition } from "@engenty/ai-core";
import {
  buildEngentyApiCatalogTool,
  DEFAULT_AI_CHAT_MODEL_ID,
} from "@engenty/ai-core";

export const TASKS_ASSIST_AGENT_ID = "tasks.assist";

export const TASKS_ASSIST_SKILL_IDS = ["task-workflow"];

function formatSnapshot(snapshot: unknown): string {
  try {
    return JSON.stringify(snapshot, null, 0);
  } catch {
    return String(snapshot);
  }
}

export async function buildTasksAssistSystemPrompt(
  context: Record<string, unknown> | null | undefined
): Promise<string> {
  const entityId =
    typeof context?.entityId === "string" && context.entityId.length > 0
      ? context.entityId
      : null;
  const goalId =
    typeof context?.goal_id === "string" && context.goal_id.length > 0
      ? context.goal_id
      : null;
  const listSearch =
    typeof context?.list_search === "string" ? context.list_search.trim() : "";
  const taskTitle =
    typeof context?.task_title === "string" ? context.task_title.trim() : "";
  const taskSnapshot =
    context?.task_snapshot != null &&
    typeof context.task_snapshot === "object" &&
    !Array.isArray(context.task_snapshot)
      ? context.task_snapshot
      : null;
  const tasksPreview = Array.isArray(context?.tasks_preview)
    ? context.tasks_preview
    : null;
  const goalsPreview = Array.isArray(context?.goals_preview)
    ? context.goals_preview
    : null;
  const briefingSnapshot =
    context?.tasks_briefing_snapshot != null &&
    typeof context.tasks_briefing_snapshot === "object" &&
    !Array.isArray(context.tasks_briefing_snapshot)
      ? context.tasks_briefing_snapshot
      : null;

  const lines = [
    "You help users understand and work with goals and tasks in Engenty.",
    "Use snake_case for all field names when discussing API data.",
    "Prefer registered catalog operations (`tasks.*`, `goals.*`) via engenty_tools_search and engenty_tool_execute.",
    "Follow the task-workflow skill: checkout before agent work, never retry 409 checkout conflicts, use tasks.addComment for partial progress.",
  ];

  if (taskSnapshot) {
    lines.push(
      "Current task (preloaded from the page the user is viewing):",
      "```json",
      formatSnapshot(taskSnapshot),
      "```",
      "Use this for summaries and basic questions about the open task. Call tasks.get only when you need fresh data or updates not in the snapshot."
    );
  } else if (briefingSnapshot) {
    lines.push(
      "Tasks briefing snapshot (preloaded):",
      "```json",
      formatSnapshot(briefingSnapshot),
      "```",
      "Use this for prioritization questions (focus, attention, waiting, stale). Call tasks.list when you need a full filtered search beyond this snapshot."
    );
  } else if (tasksPreview && tasksPreview.length > 0) {
    lines.push(
      "Visible tasks (preloaded from the list the user is viewing):",
      "```json",
      formatSnapshot(tasksPreview),
      "```",
      "Use this for list-style questions. Call tasks.list for full search, filters, or pagination."
    );
  } else if (goalsPreview && goalsPreview.length > 0) {
    lines.push(
      "Visible goals (preloaded from the list the user is viewing):",
      "```json",
      formatSnapshot(goalsPreview),
      "```",
      "Use this for goal portfolio questions. Call goals.list for full search or filters."
    );
  } else {
    lines.push(
      "When task or goal data is not preloaded, use engenty_tools_search with moduleId tasks, then engenty_tool_execute for tasks.list, tasks.get, or goals.list."
    );
  }

  if (entityId && !taskSnapshot) {
    lines.push(
      `Current page: task detail. scope.entityId=${entityId}.` +
        (taskTitle ? ` UI title hint: "${taskTitle}".` : "") +
        " Call tasks.get before answering in depth when no snapshot is present."
    );
  } else if (goalId) {
    lines.push(
      `Current goal context: goal_id=${goalId}. Use goals.get or tasks.list with goal_id when you need linked tasks.`
    );
  } else if (
    !(taskSnapshot || tasksPreview || goalsPreview || briefingSnapshot)
  ) {
    lines.push(
      "Current page: tasks module area (list, goals, or briefing)." +
        (listSearch ? ` List filter from UI: list_search="${listSearch}".` : "")
    );
  }

  lines.push(
    "Do not invent task status, assignees, or goal links. If data is missing after tools, say so."
  );

  return lines.join("\n");
}

export function createTasksAssistAgentDefinition(): AgentDefinition {
  return {
    build_system_prompt: ({ context }) => buildTasksAssistSystemPrompt(context),
    build_tools: (execCtx) => ({
      engentyApiCatalog: buildEngentyApiCatalogTool(execCtx) as object,
    }),
    description:
      "Help users prioritize, understand, and update goals and tasks.",
    id: TASKS_ASSIST_AGENT_ID,
    instruction_keys: [],
    module_id: "tasks",
    name: "Tasks Assist",
    skills: TASKS_ASSIST_SKILL_IDS,
  };
}

export const tasksAssistAgentConfig = {
  description: "Help users prioritize, understand, and update goals and tasks.",
  id: TASKS_ASSIST_AGENT_ID,
  instructions: [
    "You help users understand and work with goals and tasks in Engenty.",
    "Use snake_case for all field names when discussing API data.",
    "Prefer catalog operations via engenty_tools_search and engenty_tool_execute.",
  ].join("\n"),
  model: DEFAULT_AI_CHAT_MODEL_ID,
  name: "Tasks Assist",
  skillIds: TASKS_ASSIST_SKILL_IDS,
  source: "module" as const,
  toolIds: ["engenty_tools_search", "engenty_tool_execute"],
  // Staff preset: /home (agent-scoped), /shared (tenant), /skills (ro),
  // /task (rw, requireBinding) — the harness mounts /task only when the
  // session is bound to a checked-out task (route_context.task_identifier).
  workspace: { preset: "staff" as const },
};
