// Routine target executor. A Routine = Trigger(schedule) → Task, so the only
// executor is "create a Task". Headless agent-prompt work moved to
// system-jobs.ts; routine→action is removed (a Task may invoke an action).
// See docs/content/wip/agent-platform/actions-tasks-routines-concept.md.
import type {
  DynamicAiModuleCapabilityLoader,
  RoutineDefinition,
} from "@engenty/ai-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiService, AiSessionScope } from "../ai/index.js";
import { createScopeModuleOperationInvoker } from "../ai/sessions/task-workspace-hook.js";
import type { AgentRunStore } from "../dal/agent-sessions/index.js";

export interface RoutineExecutionContext {
  aiService: AiService;
  authorization: string;
  db: SupabaseClient | null;
  // Tenant-scoped module capability channel (kept for system jobs sharing this ctx).
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  runStore: AgentRunStore | null;
  scope: AiSessionScope;
}

async function executeTaskTemplate(
  routine: RoutineDefinition,
  ctx: RoutineExecutionContext
): Promise<string> {
  const template = routine.target.task_template;
  if (!template) {
    throw new Error(
      `routine ${routine.id}: task_template target requires task_template`
    );
  }
  const invoke = createScopeModuleOperationInvoker(ctx.scope);
  const task = (await invoke("tasks_create", {
    description: template.description ?? null,
    primary_assignee_agent_type_key: template.agent_type_key,
    primary_assignee_kind: "agent",
    priority: template.priority ?? "medium",
    title: template.title,
  })) as { id?: string } | null;
  return `task ${task?.id ?? "?"} created for ${template.agent_type_key}`;
}

/**
 * Execute a routine: create its Task. Throws on failure; result string on
 * success. Legacy `agent_prompt` / `action` kinds are rejected — a routine
 * creates a Task (system jobs cover headless agent prompts).
 */
export async function executeRoutineTarget(
  routine: RoutineDefinition,
  ctx: RoutineExecutionContext
): Promise<string> {
  if (routine.target.kind !== "task_template") {
    throw new Error(
      `routine ${routine.id}: target kind "${String(routine.target.kind)}" is removed — a routine creates a Task (task_template). See the Actions/Tasks/Routines spec.`
    );
  }
  return executeTaskTemplate(routine, ctx);
}
