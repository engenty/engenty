// Routines UI ↔ Triggers API. "Routine" is the user-facing name for a
// schedule Trigger: a cron schedule attached to a task template — firing it
// materializes a Task. Backed by /ai/v1/triggers (Mastra heartbeats do the
// scheduling; there is no prompt-only routine).
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export interface RoutineDto {
  /** Assignee agent of the task template. */
  agent_id: string | null;
  cron: string | null;
  description: string | null;
  enabled: boolean;
  id: string;
  last_result: string | null;
  last_run_at: string | null;
  module_id: string | null;
  name: string;
  next_due_at: string | null;
  /** Task instructions — the task template's description. */
  prompt: string | null;
  quiet_hours: string | null;
  source: "module" | "custom";
  task_template_id: string | null;
  task_title: string | null;
}

interface TriggerDto {
  cron: string | null;
  description: string | null;
  enabled: boolean;
  id: string;
  last_fired_at: string | null;
  last_result: string | null;
  module_id: string | null;
  name: string;
  next_fire_at: string | null;
  quiet_hours: string | null;
  source: "module" | "custom";
  task_template: {
    agent_type_key: string;
    description: string | null;
    id: string;
    title: string;
  } | null;
  task_template_id: string;
}

export interface CustomRoutineInput {
  agent_id: string;
  cron: string;
  description?: string | null;
  enabled?: boolean;
  name: string;
  prompt: string;
  quiet_hours?: string | null;
}

function toRoutineDto(trigger: TriggerDto): RoutineDto {
  return {
    agent_id: trigger.task_template?.agent_type_key ?? null,
    cron: trigger.cron,
    description: trigger.description,
    enabled: trigger.enabled,
    id: trigger.id,
    last_result: trigger.last_result,
    last_run_at: trigger.last_fired_at,
    module_id: trigger.module_id,
    name: trigger.name,
    next_due_at: trigger.next_fire_at,
    prompt: trigger.task_template?.description ?? null,
    quiet_hours: trigger.quiet_hours,
    source: trigger.source,
    task_template_id: trigger.task_template?.id ?? trigger.task_template_id,
    task_title: trigger.task_template?.title ?? null,
  };
}

export async function listRoutines(
  signal?: AbortSignal
): Promise<{ routines: RoutineDto[] }> {
  const { triggers } = await requestAiServiceJson<{ triggers: TriggerDto[] }>(
    "/ai/v1/triggers",
    { signal }
  );
  return { routines: triggers.map(toRoutineDto) };
}

export async function patchRoutineState(
  id: string,
  patch: { cron?: string; enabled?: boolean }
): Promise<{ ok: boolean }> {
  await requestAiServiceJson(`/ai/v1/triggers/${encodeURIComponent(id)}`, {
    body: JSON.stringify(patch),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  return { ok: true };
}

export async function runRoutineNow(
  id: string
): Promise<{ ok: boolean; task?: { id: string } }> {
  return requestAiServiceJson<{ ok: boolean; task?: { id: string } }>(
    `/ai/v1/triggers/${encodeURIComponent(id)}/run`,
    { method: "POST" }
  );
}

function toTriggerPayload(body: Partial<CustomRoutineInput>) {
  const template =
    body.agent_id !== undefined ||
    body.name !== undefined ||
    body.prompt !== undefined
      ? {
          task_template: {
            ...(body.agent_id === undefined
              ? {}
              : { agent_type_key: body.agent_id }),
            ...(body.name === undefined
              ? {}
              : { name: body.name, title: body.name }),
            ...(body.prompt === undefined
              ? {}
              : { description: body.prompt || null }),
          },
        }
      : {};
  return {
    cron: body.cron,
    description: body.description,
    enabled: body.enabled,
    name: body.name,
    quiet_hours: body.quiet_hours,
    ...template,
  };
}

export async function createCustomRoutine(
  body: CustomRoutineInput
): Promise<{ routine: RoutineDto }> {
  const { trigger } = await requestAiServiceJson<{ trigger: TriggerDto }>(
    "/ai/v1/triggers",
    {
      body: JSON.stringify(toTriggerPayload(body)),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );
  return { routine: toRoutineDto(trigger) };
}

export async function updateCustomRoutine(
  id: string,
  body: Partial<CustomRoutineInput>
): Promise<{ routine: RoutineDto }> {
  const { trigger } = await requestAiServiceJson<{ trigger: TriggerDto }>(
    `/ai/v1/triggers/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(toTriggerPayload(body)),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }
  );
  return { routine: toRoutineDto(trigger) };
}

export async function deleteCustomRoutine(
  id: string
): Promise<{ ok: boolean }> {
  return requestAiServiceJson<{ ok: boolean }>(
    `/ai/v1/triggers/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}
