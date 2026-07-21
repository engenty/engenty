// The single trigger execution path: materialize the trigger's task template
// into a real Task and auto-dispatch it when it targets an agent. Called by
// the `triggers_fire` gateway op (scheduled fires via the apps/ai heartbeat
// hook + manual "run now"), the module-event subscriber, and the webhook
// route — event fires attach the event payload so the task's agent sees what
// happened.
import type { QueueServiceLike } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTasksRepoSupabase } from "../dal/supabase.js";
import { createTriggersRepoSupabase } from "../dal/triggers.js";
import type { Task, TriggerDetail } from "../schema/types.js";
import { dispatchTaskIfReady } from "./task-dispatch-service.js";

const EVENT_CONTEXT_MAX_CHARS = 4000;

/** Append the firing event's payload to the task description so the agent
 * works on the concrete occurrence, not just the template's generic brief. */
function withEventContext(
  description: string | null,
  eventContext: Record<string, unknown> | undefined
): string | null {
  if (!eventContext) {
    return description;
  }
  let payload: string;
  try {
    payload = JSON.stringify(eventContext, null, 2);
  } catch {
    payload = String(eventContext);
  }
  if (payload.length > EVENT_CONTEXT_MAX_CHARS) {
    payload = `${payload.slice(0, EVENT_CONTEXT_MAX_CHARS)}\n… (truncated)`;
  }
  const section = `## Triggering event\n\n\`\`\`json\n${payload}\n\`\`\``;
  return description ? `${description}\n\n${section}` : section;
}

export interface FireTriggerInput {
  /** The acting user for manual fires; event/scheduled fires have none. */
  createdByUserId?: string | null;
  /** Event payload snapshot attached to the materialized task. */
  eventContext?: Record<string, unknown>;
  /** Fire annotation for last_result, e.g. "module event contacts.contact.created". */
  firedBy?: string;
  queue?: QueueServiceLike | null;
  supabase: SupabaseClient;
  trigger: TriggerDetail;
}

/** Materialize a trigger's task, scoped to the trigger's own tenant/scope. */
export async function fireTrigger(input: FireTriggerInput): Promise<Task> {
  const { trigger } = input;
  const template = trigger.task_template;
  if (!template) {
    throw new Error("trigger_task_template_missing");
  }
  const tasksRepo = createTasksRepoSupabase(
    input.supabase,
    trigger.tenant_id,
    trigger.scope_id
  );
  const triggersRepo = createTriggersRepoSupabase(
    input.supabase,
    trigger.tenant_id,
    trigger.scope_id
  );
  const task = await tasksRepo.createTask(
    {
      description: withEventContext(template.description, input.eventContext),
      primary_assignee_agent_type_key: template.agent_type_key,
      primary_assignee_kind: "agent",
      priority: template.priority,
      title: template.title,
    },
    { actorKind: "agent", createdByUserId: input.createdByUserId ?? null }
  );
  await triggersRepo.recordTriggerFire(
    trigger.id,
    `task ${task.id} created${input.firedBy ? ` (${input.firedBy})` : ""}`
  );
  if (input.queue) {
    await dispatchTaskIfReady(
      { queue: input.queue, repo: tasksRepo, tenantId: trigger.tenant_id },
      task
    );
  }
  return task;
}
