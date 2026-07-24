// Routines UI ↔ Triggers API. "Routine" is the user-facing name for a
// schedule Trigger: a cron schedule attached to a task template — firing it
// materializes a Task. Backed by /ai/v1/triggers (Mastra heartbeats do the
// scheduling; there is no prompt-only routine).
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

export interface RoutineDto {
  /** Assignee agent of the task template. */
  agent_id: string | null;
  /** Operation ids runs of this routine may execute without asking. */
  approval_grants: string[];
  cron: string | null;
  description: string | null;
  enabled: boolean;
  event_filter: Record<string, unknown> | null;
  id: string;
  kind: "schedule" | "event" | "manual";
  last_result: string | null;
  last_run_at: string | null;
  module_id: string | null;
  name: string;
  next_due_at: string | null;
  /** Task instructions — the task template's description. */
  prompt: string | null;
  provider_id: "module-events" | "webhook" | null;
  quiet_hours: string | null;
  resource: string | null;
  source: "module" | "custom";
  /** Standing host task for schedule routines (Phase 2 run model B). */
  standing_task_id: string | null;
  standing_task_identifier: string | null;
  task_template_id: string | null;
  task_title: string | null;
  /** webhook provider only: the secret path segment of the hook URL. */
  webhook_secret: string | null;
}

interface TriggerDto {
  approval_grants?: string[];
  cron: string | null;
  description: string | null;
  enabled: boolean;
  event_filter: Record<string, unknown> | null;
  id: string;
  kind: "schedule" | "event" | "manual";
  last_fired_at: string | null;
  last_result: string | null;
  module_id: string | null;
  name: string;
  next_fire_at: string | null;
  provider_id: "module-events" | "webhook" | null;
  quiet_hours: string | null;
  resource: string | null;
  source: "module" | "custom";
  standing_task_id?: string | null;
  standing_task_identifier?: string | null;
  task_template: {
    agent_type_key: string;
    description: string | null;
    id: string;
    title: string;
  } | null;
  task_template_id: string;
  webhook_secret: string | null;
}

export interface CustomRoutineInput {
  agent_id: string;
  approval_grants?: string[];
  cron?: string | null;
  description?: string | null;
  enabled?: boolean;
  event_filter?: Record<string, unknown> | null;
  kind?: "schedule" | "event";
  name: string;
  prompt: string;
  provider_id?: "module-events" | "webhook" | null;
  quiet_hours?: string | null;
  resource?: string | null;
}

function toRoutineDto(trigger: TriggerDto): RoutineDto {
  return {
    agent_id: trigger.task_template?.agent_type_key ?? null,
    approval_grants: trigger.approval_grants ?? [],
    cron: trigger.cron,
    description: trigger.description,
    enabled: trigger.enabled,
    event_filter: trigger.event_filter ?? null,
    id: trigger.id,
    kind: trigger.kind ?? "schedule",
    last_result: trigger.last_result,
    last_run_at: trigger.last_fired_at,
    module_id: trigger.module_id,
    name: trigger.name,
    next_due_at: trigger.next_fire_at,
    prompt: trigger.task_template?.description ?? null,
    provider_id: trigger.provider_id ?? null,
    quiet_hours: trigger.quiet_hours,
    resource: trigger.resource ?? null,
    source: trigger.source,
    standing_task_id: trigger.standing_task_id ?? null,
    standing_task_identifier: trigger.standing_task_identifier ?? null,
    task_template_id: trigger.task_template?.id ?? trigger.task_template_id,
    task_title: trigger.task_template?.title ?? null,
    webhook_secret: trigger.webhook_secret ?? null,
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
    ...(body.approval_grants === undefined
      ? {}
      : { approval_grants: body.approval_grants }),
    cron: body.cron,
    description: body.description,
    enabled: body.enabled,
    ...(body.event_filter === undefined
      ? {}
      : { event_filter: body.event_filter }),
    ...(body.kind === undefined ? {} : { kind: body.kind }),
    name: body.name,
    ...(body.provider_id === undefined
      ? {}
      : { provider_id: body.provider_id }),
    quiet_hours: body.quiet_hours,
    ...(body.resource === undefined ? {} : { resource: body.resource }),
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
