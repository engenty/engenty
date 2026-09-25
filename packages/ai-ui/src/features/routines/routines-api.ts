// Routines UI ↔ `/ai/v1/routines`.
//
// A routine is the standing arrangement on a mounted specialist: it names a
// published Workflow and carries behaviour — the outcome promise,
// the report floor, quiet hours. Its wake sources are 1..n TRIGGER rows
// (schedule, event, manual press, agent invoke); each is its own record with
// its own pause switch. Firing starts a RUN, never a Task.
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";

/**
 * How loudly a finished run reports — DECLARED, and a floor rather than an
 * override: a run may escalate above it, never below.
 *
 * quiet = may end in silence · desk_card = always leaves a card on the desk ·
 * ask = always comes back to a person before it counts as done.
 */
export type RoutineReportMode = "quiet" | "desk_card" | "ask";

export type RoutineTriggerKind = "schedule" | "event" | "manual" | "agent";

/** When a destination fires: every settle, or only when the run calls it. */
export type RoutineOutcomeMode = "always" | "agent";

/** One destination of a routine — a row in `ai.routine_outcomes`. */
export interface RoutineOutcomeDto {
  config: Record<string, unknown>;
  created_at: string;
  enabled: boolean;
  id: string;
  mode: RoutineOutcomeMode;
  provider_id: string;
  routine_id: string;
  tenant_id: string;
  updated_at: string;
}

/** One destination, as the API writes it. */
export interface RoutineOutcomeInput {
  config?: Record<string, unknown>;
  enabled?: boolean;
  mode: RoutineOutcomeMode;
  provider_id: string;
}

/** A registered destination from `GET /ai/v1/outcome-providers`. */
export interface OutcomeProviderDto {
  config_schema: Record<string, unknown>;
  description: string;
  id: string;
  label: string;
  module_id: string;
  operation_id?: string;
  payload_schema: Record<string, unknown>;
}

/** One wake source of a routine. */
export interface RoutineTriggerDto {
  created_at: string;
  cron: string | null;
  enabled: boolean;
  event_filter: Record<string, unknown> | null;
  id: string;
  /** Event payload → Action input; null = the payload itself is the input. */
  input_mapping: Record<string, unknown> | null;
  kind: RoutineTriggerKind;
  /** Computed from the Mastra schedule at read time — not a stored column. */
  next_due_at: string | null;
  provider_id: "module-events" | "webhook" | null;
  resource: string | null;
  routine_id: string;
  /** Manual kind: a short key a person can invoke the routine by. */
  shortcode: string | null;
  /** IANA zone the cron's hours are local to; null = the cron is UTC. */
  timezone: string | null;
  updated_at: string;
  /** webhook provider only: the secret path segment of the hook URL. */
  webhook_secret: string | null;
}

export interface RoutineDto {
  /** The mounted specialist that owns this routine. Always set. */
  agent_id: string;
  /** Operation ids a fire may execute without asking. */
  approval_grants: string[];
  created_at: string;
  created_by_user_id: string | null;
  /** Module-declared bindings only: the trigger declaration this came from. */
  declaration_id: string | null;
  description: string | null;
  /** Master switch — off pauses every trigger at once. */
  enabled: boolean;
  id: string;
  last_fired_at: string | null;
  last_result: string | null;
  module_id: string | null;
  name: string;
  /** Earliest schedule trigger's next fire; computed at read time. */
  next_due_at: string | null;
  /**
   * The routine's PROMISE — what a fire must have achieved to count as done.
   * Prose, deliberately not a schema: a specialist answers in prose, and an
   * Action that needs a typed result already has its own output schema.
   */
  outcome: string | null;
  /**
   * Destinations a fire delivers to. Empty keeps the legacy `report` desk
   * post; any rows replace that post. `report: ask` still holds the run.
   */
  outcomes: RoutineOutcomeDto[];
  /**
   * The prompt this routine runs, when it is a prompt routine — a one-node
   * workflow the server keeps in step with this text. Null for a workflow
   * chosen on the canvas.
   */
  prompt?: string | null;
  quiet_hours: string | null;
  report: RoutineReportMode;
  source: "module" | "custom";
  space_id: string | null;
  tenant_id: string;
  /** The wake sources, 1..n. */
  triggers: RoutineTriggerDto[];
  updated_at: string;
  /** The bound workflow (`ai.workflow.id`). A routine always names one. */
  workflow_id: string;
  /** Static input every fire supplies to the Action. */
  workflow_input: Record<string, unknown>;
}

/** One past fire, from `ai.workflow_run` — the routine's run history. */
export interface RoutineRunDto {
  created_at: string;
  id: string;
  reason: string | null;
  run_id: string | null;
  status: string;
  summary: string | null;
  /** What woke this run: `schedule`, `event`, `direct`, … */
  trigger: string | null;
  updated_at: string;
}

/** One wake source, as the API writes it. */
export interface RoutineTriggerInput {
  cron?: string | null;
  enabled?: boolean;
  event_filter?: Record<string, unknown> | null;
  input_mapping?: Record<string, unknown> | null;
  kind: RoutineTriggerKind;
  provider_id?: "module-events" | "webhook" | null;
  resource?: string | null;
  shortcode?: string | null;
  timezone?: string | null;
}

export interface CustomRoutineInput {
  /** The owning specialist. Required on create. */
  agent_id?: string;
  approval_grants?: string[];
  description?: string | null;
  enabled?: boolean;
  name?: string;
  /** The routine's promise, in prose. */
  outcome?: string | null;
  /**
   * Destinations. On create, omitted keeps the legacy desk post. On PATCH,
   * present replaces the list (including `[]`); omitted leaves bindings.
   */
  outcomes?: RoutineOutcomeInput[];
  /**
   * A prompt instead of a workflow: the server materializes and publishes a
   * one-node workflow for it. Create takes one of `prompt` / `workflow_id`;
   * on patch it re-briefs (or rebinds to) the prompt workflow.
   */
  prompt?: string;
  quiet_hours?: string | null;
  /** Declared report floor. */
  report?: RoutineReportMode;
  /** Space the routine belongs to; omitted falls back to the tenant default. */
  space_id?: string;
  /** Create only: the initial wake sources. Omitted = manual + agent. */
  triggers?: RoutineTriggerInput[];
  /** The workflow to bind. Required on create; on patch it rebinds. */
  workflow_id?: string;
  /** Static input handed to the Action on every fire. */
  workflow_input?: Record<string, unknown>;
}

export async function listRoutines(
  signal?: AbortSignal,
  spaceId?: string
): Promise<{ routines: RoutineDto[] }> {
  const query = spaceId ? `?${new URLSearchParams({ space_id: spaceId })}` : "";
  return await requestAiServiceJson<{ routines: RoutineDto[] }>(
    `/ai/v1/routines${query}`,
    { signal }
  );
}

export async function patchRoutineState(
  id: string,
  patch: { enabled?: boolean }
): Promise<{ ok: boolean }> {
  await requestAiServiceJson(`/ai/v1/routines/${encodeURIComponent(id)}`, {
    body: JSON.stringify(patch),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  return { ok: true };
}

/** Why a fire changed nothing. Null means the run actually started. */
export type RoutineSkipReason = "disabled" | "overlap" | "quiet_hours";

export interface RunRoutineResult {
  ok: boolean;
  request_id: string | null;
  /** The run started for this fire; null whenever `skipped` is set. */
  run_id: string | null;
  /**
   * Set when the fire changed nothing: the routine is off, it is inside its
   * quiet hours, or its PREVIOUS RUN is still active (overlap is decided on
   * the run). Saying "running" in any of those cases would be a lie.
   */
  skipped: RoutineSkipReason | null;
  thread_id: string | null;
}

/**
 * Fire a routine now. A person asked for this one, so it bypasses quiet hours;
 * the service dispatches in its own process and answers with the run to watch.
 */
export async function runRoutineNow(id: string): Promise<RunRoutineResult> {
  return requestAiServiceJson<RunRoutineResult>(
    `/ai/v1/routines/${encodeURIComponent(id)}/run`,
    { method: "POST" }
  );
}

/** This routine's past fires, newest first. */
export async function listRoutineRuns(
  id: string,
  limit = 20,
  signal?: AbortSignal
): Promise<{ runs: RoutineRunDto[] }> {
  const query = `?${new URLSearchParams({ limit: String(limit) })}`;
  return requestAiServiceJson<{ runs: RoutineRunDto[] }>(
    `/ai/v1/routines/${encodeURIComponent(id)}/runs${query}`,
    { signal }
  );
}

/** The wire body — the input's set fields, verbatim. */
export function toRoutinePayload(body: Partial<CustomRoutineInput>) {
  return {
    ...(body.workflow_input === undefined
      ? {}
      : { workflow_input: body.workflow_input }),
    ...(body.agent_id === undefined ? {} : { agent_id: body.agent_id }),
    ...(body.approval_grants === undefined
      ? {}
      : { approval_grants: body.approval_grants }),
    ...(body.description === undefined
      ? {}
      : { description: body.description }),
    ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
    ...(body.name === undefined ? {} : { name: body.name }),
    ...(body.outcome === undefined ? {} : { outcome: body.outcome }),
    // Present on PATCH replaces the list, including []. Omitted leaves rows.
    ...(body.outcomes === undefined ? {} : { outcomes: body.outcomes }),
    ...(body.prompt === undefined ? {} : { prompt: body.prompt }),
    ...(body.quiet_hours === undefined
      ? {}
      : { quiet_hours: body.quiet_hours }),
    ...(body.report === undefined ? {} : { report: body.report }),
    // Create only — the PATCH schema has no `space_id`/`triggers`, and sending
    // one there would be accepted by JSON and then silently dropped.
    ...(body.space_id === undefined ? {} : { space_id: body.space_id }),
    ...(body.triggers === undefined ? {} : { triggers: body.triggers }),
    ...(body.workflow_id === undefined
      ? {}
      : { workflow_id: body.workflow_id }),
  };
}

export async function createCustomRoutine(
  body: CustomRoutineInput
): Promise<{ routine: RoutineDto }> {
  return requestAiServiceJson<{ routine: RoutineDto }>("/ai/v1/routines", {
    body: JSON.stringify(toRoutinePayload(body)),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

export async function updateCustomRoutine(
  id: string,
  body: Partial<CustomRoutineInput>
): Promise<{ routine: RoutineDto }> {
  return requestAiServiceJson<{ routine: RoutineDto }>(
    `/ai/v1/routines/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(toRoutinePayload(body)),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }
  );
}

export async function deleteCustomRoutine(
  id: string
): Promise<{ ok: boolean }> {
  return requestAiServiceJson<{ ok: boolean }>(
    `/ai/v1/routines/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

/** The wire body for one trigger — set fields only. */
function toTriggerPayload(body: Partial<RoutineTriggerInput>) {
  return {
    ...(body.cron === undefined ? {} : { cron: body.cron }),
    ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
    ...(body.event_filter === undefined
      ? {}
      : { event_filter: body.event_filter }),
    ...(body.input_mapping === undefined
      ? {}
      : { input_mapping: body.input_mapping }),
    ...(body.kind === undefined ? {} : { kind: body.kind }),
    ...(body.provider_id === undefined
      ? {}
      : { provider_id: body.provider_id }),
    ...(body.resource === undefined ? {} : { resource: body.resource }),
    ...(body.shortcode === undefined ? {} : { shortcode: body.shortcode }),
    ...(body.timezone === undefined ? {} : { timezone: body.timezone }),
  };
}

export async function createRoutineTrigger(
  routineId: string,
  body: RoutineTriggerInput
): Promise<{ routine: RoutineDto }> {
  return requestAiServiceJson<{ routine: RoutineDto }>(
    `/ai/v1/routines/${encodeURIComponent(routineId)}/triggers`,
    {
      body: JSON.stringify(toTriggerPayload(body)),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );
}

export async function updateRoutineTrigger(
  routineId: string,
  triggerId: string,
  body: Partial<RoutineTriggerInput>
): Promise<{ routine: RoutineDto }> {
  return requestAiServiceJson<{ routine: RoutineDto }>(
    `/ai/v1/routines/${encodeURIComponent(routineId)}/triggers/${encodeURIComponent(triggerId)}`,
    {
      body: JSON.stringify(toTriggerPayload(body)),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }
  );
}

export async function deleteRoutineTrigger(
  routineId: string,
  triggerId: string
): Promise<{ routine: RoutineDto }> {
  return requestAiServiceJson<{ routine: RoutineDto }>(
    `/ai/v1/routines/${encodeURIComponent(routineId)}/triggers/${encodeURIComponent(triggerId)}`,
    { method: "DELETE" }
  );
}

export async function listOutcomeProviders(
  signal?: AbortSignal
): Promise<{ providers: OutcomeProviderDto[] }> {
  return requestAiServiceJson<{ providers: OutcomeProviderDto[] }>(
    "/ai/v1/outcome-providers",
    { signal }
  );
}

/** The wire body for one destination — set fields only. */
function toOutcomePayload(body: Partial<RoutineOutcomeInput>) {
  return {
    ...(body.config === undefined ? {} : { config: body.config }),
    ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
    ...(body.mode === undefined ? {} : { mode: body.mode }),
    ...(body.provider_id === undefined
      ? {}
      : { provider_id: body.provider_id }),
  };
}

export async function createRoutineOutcome(
  routineId: string,
  body: RoutineOutcomeInput
): Promise<{ routine: RoutineDto }> {
  return requestAiServiceJson<{ routine: RoutineDto }>(
    `/ai/v1/routines/${encodeURIComponent(routineId)}/outcomes`,
    {
      body: JSON.stringify(toOutcomePayload(body)),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );
}

export async function updateRoutineOutcome(
  routineId: string,
  outcomeId: string,
  body: Partial<RoutineOutcomeInput>
): Promise<{ routine: RoutineDto }> {
  return requestAiServiceJson<{ routine: RoutineDto }>(
    `/ai/v1/routines/${encodeURIComponent(routineId)}/outcomes/${encodeURIComponent(outcomeId)}`,
    {
      body: JSON.stringify(toOutcomePayload(body)),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }
  );
}

export async function deleteRoutineOutcome(
  routineId: string,
  outcomeId: string
): Promise<{ routine: RoutineDto }> {
  return requestAiServiceJson<{ routine: RoutineDto }>(
    `/ai/v1/routines/${encodeURIComponent(routineId)}/outcomes/${encodeURIComponent(outcomeId)}`,
    { method: "DELETE" }
  );
}
