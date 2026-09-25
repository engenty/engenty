// routines_*: the jobs a mounted specialist runs on its own.
//
// A routine is a workflow to run plus a wake source. Firing it starts a RUN —
// it does not create a Task, and there is no work item standing in for the job.
// A specialist is complete without a routine; a routine is how it also works
// unattended.
//
// These replace the `triggers_*` operations, which put the wake source on one
// row and the job's body on a "standing task" — so every writer had to know
// which half a field lived in, and every fire left a card nobody could close.
//
// Who may call what (caller-scope.ts): the copilot manages every routine in
// the Space, a coordinator the ones of the engenties it answers for, a
// specialist only its own — and its own it may CREATE too: "do this every
// Friday" said to the engenty that owns the job must not fail silently
// because only a manager held the verb. Whether a person confirms first is
// the Space's approval mode (routine-approval.ts), not a prompt rule.
import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  createRoutineOutcomeStoreFromEnv,
  createRoutineStoreFromEnv,
  createRoutineTriggerStoreFromEnv,
  createThreadStoreFromEnv,
  createWorkflowRunStoreFromEnv,
  createWorkflowStoreFromEnv,
} from "../../src/ai/index.js";
import {
  resolveEffectiveAgentApprovalMode,
  type TaskCompletionPolicyDeps,
  taskCompletionPolicyDepsFromEnv,
} from "../../src/ai/jobs/task-completion-policy.js";
import { createDefaultModuleCapabilityLoader } from "../../src/ai/module-capability-loader.js";
import { cancelActiveRoutineRun } from "../../src/ai/routines/cancel-routine-run.js";
import { fireRoutine } from "../../src/ai/routines/fire-routine.js";
import {
  assertOutcomeBinding,
  type OutcomeBody,
  outcomeSchema,
  outcomesByRoutine,
  replaceRoutineOutcomes,
} from "../../src/ai/routines/outcomes/bindings.js";
import { BUILTIN_OUTCOME_PROVIDERS } from "../../src/ai/routines/outcomes/definitions.js";
import { isExternalOutcomeProvider } from "../../src/ai/routines/outcomes/ids.js";
import {
  assertRoutineEligibleAgent,
  assertValidSchedule,
  findDuplicateRoutine,
  RoutineValidationError,
} from "../../src/ai/routines/routine-validation.js";
import {
  type AiSessionScope,
  scopeCoversCapability,
} from "../../src/ai/sessions/types.js";
import { speakOnDesk } from "../../src/ai/threads/speak-on-desk.js";
import { capabilityForModuleOperation } from "../../src/ai/workflows/capabilities.js";
import {
  isPromptWorkflowGraph,
  materializePromptWorkflow,
  PROMPT_ROUTINE_MAX_CHARS,
  PROMPT_ROUTINE_RESULTS,
  type PromptRoutineResult,
  PromptWorkflowInvalidError,
  promptOfWorkflowGraph,
  promptWorkflowDefinition,
} from "../../src/ai/workflows/prompt-workflow.js";
import {
  type GraphWorkflowDefinition,
  validateGraphAction,
} from "../../src/ai/workflows/validate-graph.js";
import { createCoreAiScopeResolver } from "../../src/api/http.js";
import type {
  RoutineOutcomeRow,
  RoutineOutcomeStore,
} from "../../src/dal/routines/routine-outcome-store.js";
import type {
  RoutineRow,
  RoutineStore,
} from "../../src/dal/routines/routine-store.js";
import type {
  RoutineTriggerRow,
  RoutineTriggerStore,
} from "../../src/dal/routines/routine-trigger-store.js";
import type { ThreadStore } from "../../src/dal/threads/thread-store.js";
import type { WorkflowRunStore } from "../../src/dal/workflow-runs/workflow-run-store.js";
import type {
  WorkflowRow,
  WorkflowStore,
} from "../../src/dal/workflows/workflow-store.js";
import { emitInboxNotification } from "../../src/notifications/inbox.js";
import { releaseFrontendToolSuspendSlot } from "../frontend-tools/frontend-tool-suspend-lock.js";
import { readDecisionChoice } from "./agent-propose-hire.js";
import { describeCron } from "./describe-schedule.js";
import {
  type CallerScope,
  callerScope,
  coordinatorIdsForRun,
} from "./engenty-tools/lib/caller-scope.js";
import { resolveRegistryAgent } from "./engenty-tools/lib/registry-agent.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import {
  isGlobalConnectorGate,
  isUnresolvedSpaceGate,
} from "./engenty-tools/lib/space-gate.js";
import {
  type NativeRequestDecisionResumeData,
  requestDecisionResumeSchema,
} from "./request-decision/native-request-decision.js";
import {
  decideRoutineApproval,
  routineApprovalRefusalNote,
  routineDecisionArtifact,
  routineSuspendLockKey,
  suspendRoutineDecision,
} from "./routine-approval.js";

export const ROUTINES_LIST_TOOL_ID = "routines_list";
export const ROUTINES_CREATE_TOOL_ID = "routines_create";
export const ROUTINES_UPDATE_TOOL_ID = "routines_update";
export const ROUTINES_RUN_TOOL_ID = "routines_run";
export const ROUTINES_CANCEL_RUN_TOOL_ID = "routines_cancel_run";

/** The run's own capabilities — what a Workflow it publishes may perform. */
type RunScope = Pick<AiSessionScope, "capabilities" | "userId">;

export interface RoutineToolDeps {
  /** The approval-mode layers; null = mode unresolvable, treated as manual. */
  approvalPolicy?: () => TaskCompletionPolicyDeps | null;
  inbox?: typeof emitInboxNotification;
  /** Plugin destination providers; built-ins are always known. */
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  outcomes?: () => RoutineOutcomeStore | null;
  resolveAgent?: typeof resolveRegistryAgent;
  /** The run's bearer, re-resolved into a scope; null = no capabilities. */
  resolveScope?: (accessToken: string) => Promise<RunScope | null>;
  routines?: () => RoutineStore | null;
  threads?: () => ThreadStore | null;
  triggers?: () => RoutineTriggerStore | null;
  workflowRuns?: () => WorkflowRunStore | null;
  workflows?: () => WorkflowStore | null;
}

async function defaultResolveScope(
  accessToken: string
): Promise<RunScope | null> {
  const resolved = await createCoreAiScopeResolver()({
    authorization: `Bearer ${accessToken}`,
  });
  return resolved.ok ? resolved.scope : null;
}

function requireTenant(toolId: string): string {
  const tenantId = getEngentyToolsRunContext().tenantId?.trim();
  if (!tenantId) {
    throw new Error(`${toolId} is unavailable in this run (no tenant).`);
  }
  return tenantId;
}

function requireStore(deps: RoutineToolDeps): RoutineStore {
  const store = (deps.routines ?? createRoutineStoreFromEnv)();
  if (!store) {
    throw new Error("routine storage is not configured.");
  }
  return store;
}

function requireTriggerStore(deps: RoutineToolDeps): RoutineTriggerStore {
  const store = (deps.triggers ?? createRoutineTriggerStoreFromEnv)();
  if (!store) {
    throw new Error("routine storage is not configured.");
  }
  return store;
}

/** True when `next` holds an external destination `current` does not. */
function addsExternalDestination(
  next: readonly {
    config?: Record<string, unknown>;
    mode: string;
    provider_id: string;
  }[],
  current: readonly {
    config: Record<string, unknown>;
    mode: string;
    provider_id: string;
  }[]
): boolean {
  const key = (row: {
    config?: Record<string, unknown>;
    mode: string;
    provider_id: string;
  }) => `${row.provider_id}|${row.mode}|${JSON.stringify(row.config ?? {})}`;
  const known = new Set(current.map(key));
  return next.some(
    (row) => isExternalOutcomeProvider(row.provider_id) && !known.has(key(row))
  );
}

function requireOutcomeStore(deps: RoutineToolDeps): RoutineOutcomeStore {
  const store = (deps.outcomes ?? createRoutineOutcomeStoreFromEnv)();
  if (!store) {
    throw new Error("routine storage is not configured.");
  }
  return store;
}

/** The shape an agent reads back: the routine, its wake sources, its destinations. */
function toToolShape(
  routine: RoutineRow,
  triggers: RoutineTriggerRow[],
  outcomes: RoutineOutcomeRow[]
) {
  return {
    agent_id: routine.agent_id,
    approval_grants: routine.approval_grants,
    enabled: routine.enabled,
    last_fired_at: routine.last_fired_at,
    last_result: routine.last_result,
    name: routine.name,
    outcomes: outcomes.map((row) => ({
      config: row.config,
      description: row.description,
      enabled: row.enabled,
      mode: row.mode,
      outcome_id: row.id,
      provider_id: row.provider_id,
    })),
    report: routine.report,
    routine_id: routine.id,
    source: routine.source,
    triggers: triggers.map((trigger) => ({
      cron: trigger.cron,
      enabled: trigger.enabled,
      kind: trigger.kind,
      resource: trigger.resource,
      timezone: trigger.timezone,
      trigger_id: trigger.id,
    })),
    workflow_id: routine.workflow_id,
  };
}

const routineOutputSchema = z.object({
  agent_id: z.string(),
  approval_grants: z.array(z.string()),
  enabled: z.boolean(),
  last_fired_at: z.string().nullable(),
  last_result: z.string().nullable(),
  name: z.string(),
  outcomes: z.array(
    z.object({
      config: z.record(z.string(), z.unknown()),
      enabled: z.boolean(),
      mode: z.enum(["always", "agent"]),
      outcome_id: z.string(),
      provider_id: z.string(),
    })
  ),
  report: z.enum(["quiet", "desk_card", "ask"]),
  routine_id: z.string(),
  source: z.string(),
  triggers: z.array(
    z.object({
      cron: z.string().nullable(),
      enabled: z.boolean(),
      kind: z.string(),
      resource: z.string().nullable(),
      timezone: z.string().nullable(),
      trigger_id: z.string(),
    })
  ),
  workflow_id: z.string(),
});

/** A tenant's triggers, grouped by routine id. */
async function loadTriggers(
  deps: RoutineToolDeps,
  tenantId: string
): Promise<Map<string, RoutineTriggerRow[]>> {
  const rows = await requireTriggerStore(deps).list({ tenantId });
  const map = new Map<string, RoutineTriggerRow[]>();
  for (const row of rows) {
    const list = map.get(row.routine_id) ?? [];
    list.push(row);
    map.set(row.routine_id, list);
  }
  return map;
}

/** What this caller may see or steer: everything, the Space's, or its own. */
function visibleTo(scope: CallerScope, routine: RoutineRow): boolean {
  return scope.kind === "specialist" ? routine.agent_id === scope.id : true;
}

/** Wake-source fields shared by create and the approval card. */
const triggerKindSchema = z
  .enum(["schedule", "event", "manual", "agent"])
  .default("schedule")
  .describe(
    "What wakes it. `schedule` = a clock (needs cron + timezone), " +
      "`event` = a module event (needs provider_id). `manual` = nothing " +
      "wakes it on its own: it runs when a person presses it. `agent` = " +
      "it runs when someone asks for it in chat. Use manual or agent for " +
      "a job that should exist and be runnable but must NOT run by " +
      "itself — never invent a cron to satisfy this field."
  );

const reportSchema = z
  .enum(["quiet", "desk_card", "ask"])
  .describe(
    "The fallback when the routine has no `outcomes`: how loudly a run's " +
      "result lands in the owner's chat. quiet posts nothing, desk_card " +
      "posts the result as a low-priority desk post — not on the bell. " +
      "`ask` reports like desk_card — pausing mid-run is the agent's own " +
      "act (routine_ask), never forced by this knob. Failures always " +
      "report, whatever this says."
  );

/** `config` keys a provider takes, required ones marked. */
function configShape(schema: Record<string, unknown>): string {
  const properties = Object.keys(
    (schema.properties as Record<string, unknown> | undefined) ?? {}
  );
  if (properties.length === 0) {
    return "no config";
  }
  const required = new Set((schema.required as string[] | undefined) ?? []);
  return `config { ${properties
    .map((key) => (required.has(key) ? key : `${key}?`))
    .join(", ")} }`;
}

/** The built-in providers, for the tool text; plugins may register more. */
const BUILTIN_DESTINATIONS_TEXT = BUILTIN_OUTCOME_PROVIDERS.map(
  (provider) =>
    `\`${provider.id}\` — ${provider.description} (${configShape(provider.configSchema)})`
).join("; ");

const outcomesSchema = z
  .array(outcomeSchema)
  .max(16)
  .describe(
    "Destinations: where a settled run delivers. Each is { provider_id, " +
      "mode, config }. mode `always` delivers every run; `agent` only when " +
      "the run calls outcomes_deliver. Setting any replaces the `report` " +
      "desk post. Built-in providers: " +
      BUILTIN_DESTINATIONS_TEXT +
      ". Modules may register more — an unknown provider_id is refused " +
      "with the registered list."
  );

function capabilityOptions(scope: RunScope | null) {
  return scope
    ? {
        capabilityForOperation: capabilityForModuleOperation,
        holdsCapability: (capabilityId: string) =>
          scopeCoversCapability(scope, capabilityId),
      }
    : {};
}

/**
 * Point the routine at a runnable version: publish the Workflow's latest
 * draft. As the human who answered the card, or — in `auto` / `pass-all`,
 * where the Space trusts the agent's judgement — as the run itself, with
 * the run's own capabilities validated against the graph exactly as the
 * canvas Publish route validates the publisher's.
 */
/**
 * The graph a routine card draws: the latest version of its Workflow (the one
 * Approve publishes), or — for a prompt routine, which has no Workflow row
 * until it is approved — the one-node definition the prompt will become.
 */
async function approvalWorkflowGraph(input: {
  ownerId: string;
  prompt: string | null;
  result?: PromptRoutineResult;
  store: WorkflowStore | null;
  tenantId: string;
  workflow: WorkflowRow | null;
}): Promise<unknown> {
  if (input.workflow && input.store) {
    const versions = await input.store
      .listVersions({ tenantId: input.tenantId, workflowId: input.workflow.id })
      .catch(() => []);
    return versions.toSorted((a, b) => b.version - a.version)[0]?.graph ?? null;
  }
  return input.prompt?.trim()
    ? promptWorkflowDefinition({
        agentId: input.ownerId,
        prompt: input.prompt,
        ...(input.result ? { result: input.result } : {}),
      })
    : null;
}

async function publishForRoutine(input: {
  approvedByUserId: string | null;
  scope: RunScope | null;
  store: WorkflowStore;
  tenantId: string;
  workflow: WorkflowRow;
}): Promise<{ issues: unknown[]; published: boolean }> {
  const versions = await input.store.listVersions({
    tenantId: input.tenantId,
    workflowId: input.workflow.id,
  });
  const latest = versions.toSorted((a, b) => b.version - a.version)[0];
  if (!latest) {
    return {
      issues: [{ message: "the Workflow has no version" }],
      published: false,
    };
  }
  const issues = validateGraphAction(
    latest.graph as unknown as GraphWorkflowDefinition,
    capabilityOptions(input.scope)
  );
  if (issues.length > 0) {
    return { issues, published: false };
  }
  await input.store.publishVersion({
    approvedByUserId: input.approvedByUserId,
    tenantId: input.tenantId,
    versionId: latest.id,
  });
  return { issues: [], published: true };
}

function refused(note: string) {
  return { note, routine: null, status: "refused" as const };
}

export function createRoutineTools(deps: RoutineToolDeps = {}) {
  const resolveAgent = deps.resolveAgent ?? resolveRegistryAgent;
  const inbox = deps.inbox ?? emitInboxNotification;
  const resolveScope = deps.resolveScope ?? defaultResolveScope;

  /** Every binding checked against the registered providers, or why not. */
  async function checkOutcomes(
    bodies: OutcomeBody[] | undefined
  ): Promise<string | null> {
    if (!bodies?.length) {
      return null;
    }
    const moduleLoader =
      deps.moduleLoader ?? createDefaultModuleCapabilityLoader();
    try {
      for (const body of bodies) {
        await assertOutcomeBinding(body, moduleLoader);
      }
    } catch (err) {
      if (err instanceof RoutineValidationError) {
        return `Destination refused: ${err.message}`;
      }
      throw err;
    }
    return null;
  }

  async function writeOutcomes(input: {
    bodies: OutcomeBody[];
    routineId: string;
    tenantId: string;
  }): Promise<RoutineOutcomeRow[]> {
    return await replaceRoutineOutcomes({
      bodies: input.bodies,
      moduleLoader: deps.moduleLoader ?? createDefaultModuleCapabilityLoader(),
      outcomes: requireOutcomeStore(deps),
      routineId: input.routineId,
      tenantId: input.tenantId,
    });
  }

  async function runScope(): Promise<RunScope | null> {
    const token = getEngentyToolsRunContext().accessToken?.trim();
    if (!token) {
      return null;
    }
    try {
      return await resolveScope(token);
    } catch {
      return null;
    }
  }

  async function approvalMode(input: {
    agentTypeKey: string;
    spaceId: string | null;
    tenantId: string;
  }) {
    const policy = (deps.approvalPolicy ?? taskCompletionPolicyDepsFromEnv)();
    return policy
      ? await resolveEffectiveAgentApprovalMode(policy, input)
      : ("manual" as const);
  }

  /** The owner a caller may give a routine to — itself, or a mounted colleague. */
  async function resolveOwner(
    scope: CallerScope,
    requested: string | undefined
  ): Promise<{ ok: true; id: string } | { ok: false; note: string }> {
    const ctx = getEngentyToolsRunContext();
    const own = scope.kind === "management" ? null : scope.id;
    const agentId = requested?.trim() || own;
    if (!agentId) {
      return {
        ok: false,
        note: "Name the specialist that owns this job in `agent_id` — use registry_agents_list.",
      };
    }
    // A specialist's routines are its own. Passing a colleague's id is not
    // an error worth a retry loop — the job lands on the caller, and the
    // note says so.
    if (scope.kind === "specialist" && agentId !== scope.id) {
      return {
        ok: false,
        note: `You can only give yourself a routine. To hand '${agentId}' a job, message it (message_agent) or ask a coordinator.`,
      };
    }
    const owner = await resolveAgent(agentId);
    if (owner === null) {
      return {
        ok: false,
        note: `No agent '${agentId}' in this tenant's registry. Use registry_agents_list and pass an id it returned.`,
      };
    }
    if (owner === undefined) {
      return {
        ok: false,
        note: "The agent registry is unreachable; the routine was not created. Try again.",
      };
    }
    // The mount gate: in a resolved Space only a MOUNTED specialist can own
    // standing work here. A global run stays tenant-wide by intention.
    const space =
      ctx.space && !isUnresolvedSpaceGate(ctx.space) ? ctx.space : null;
    if (
      space &&
      !isGlobalConnectorGate(space) &&
      !(space.agentIds?.has(agentId) ?? false)
    ) {
      return {
        ok: false,
        note: `${agentId} is not mounted in this Space, so it cannot own a routine here. Mount it via space_setup or pick a specialist from registry_agents_list.`,
      };
    }
    try {
      assertRoutineEligibleAgent(owner, "custom");
    } catch (err) {
      return {
        ok: false,
        note: err instanceof Error ? err.message : String(err),
      };
    }
    return { ok: true, id: agentId };
  }

  /** A Workflow by module id ("contacts.research") or by its own uuid. */
  async function findWorkflow(
    store: WorkflowStore,
    requested: string,
    tenantId: string
  ): Promise<WorkflowRow | null> {
    const id = requested.trim();
    return (
      (await store
        .findBySourceWorkflow({ sourceWorkflowId: id, tenantId })
        .catch(() => null)) ??
      (await store.getGraph({ id, tenantId }).catch(() => null))
    );
  }

  /** Tell the desk and the inbox — the card a person sees after creation. */
  async function announceCreated(input: {
    ownerId: string;
    published: "user" | "agent" | null;
    routine: RoutineRow;
    spaceId: string | null;
    tenantId: string;
    triggers: RoutineTriggerRow[];
    workflowName: string | null;
  }) {
    const ctx = getEngentyToolsRunContext();
    const schedule = input.triggers.find((t) => t.kind === "schedule");
    const event = input.triggers.find((t) => t.kind === "event");
    const wake = schedule
      ? `${describeCron(schedule.cron).replace(/^At /, "at ")} (${schedule.timezone ?? "UTC"})`
      : event
        ? "whenever the event it waits for happens"
        : "when pressed or asked";
    const text = [
      `New routine **${input.routine.name}** — runs ${wake}.`,
      input.workflowName
        ? `It runs the Workflow "${input.workflowName}".`
        : null,
      input.routine.approval_grants.length > 0
        ? `It may do ${input.routine.approval_grants.length === 1 ? "one action" : `${input.routine.approval_grants.length} actions`} without asking.`
        : null,
    ]
      .filter((line): line is string => line !== null)
      .join(" ");
    const threads = (deps.threads ?? createThreadStoreFromEnv)();
    if (threads && input.spaceId) {
      await speakOnDesk({
        agentId: input.ownerId,
        metadata: {
          // The chat words this line in the reader's language from the
          // marker; `text` stays for history and search.
          engenty_routine_notice: {
            event: Boolean(event),
            grants: input.routine.approval_grants.length,
            kind: "created",
            name: input.routine.name,
            schedule: schedule?.cron
              ? { cron: schedule.cron, timezone: schedule.timezone ?? null }
              : null,
            workflow_name: input.workflowName,
          },
          routine_id: input.routine.id,
          source: "routine-created",
        },
        notify: false,
        ownerUserId: ctx.userId?.trim() || null,
        spaceId: input.spaceId,
        store: threads,
        tenantId: input.tenantId,
        text,
      }).catch(() => null);
    }
    const actor = ctx.agentTypeKey?.trim() || null;
    await inbox({
      actor: { id: actor, kind: actor ? "agent" : "system" },
      dedupeKey: `routine-created:${input.tenantId}:${input.routine.id}`,
      kind: "routine_created",
      metadata: {
        agent_id: input.ownerId,
        routine_id: input.routine.id,
        workflow_id: input.routine.workflow_id,
        ...(input.published ? { workflow_published_by: input.published } : {}),
      },
      priority: "low",
      source: "routines",
      spaceId: input.spaceId,
      subject: { id: input.routine.id, type: "routine" },
      // Said whole when there is no acting agent to name. Opens the owner's
      // manage panel (workflow_id + agent_id), where its routines are listed.
      summary: `New routine "${input.routine.name}"`,
      tenantId: input.tenantId,
      title: {
        key: "routine_created",
        params: { name: input.routine.name },
      },
      ...(ctx.userId ? { userId: ctx.userId } : {}),
    }).catch(() => null);
  }

  const createInputSchema = z
    .object({
      prompt: z
        .string()
        .trim()
        .min(1)
        .max(PROMPT_ROUTINE_MAX_CHARS)
        .optional()
        .describe(
          "The job — what each run does, written to the owner. The owner " +
            "does it in one go (research, reading, writing); the server then " +
            "stores the result and delivers it, so the prompt says nothing " +
            "about storing or notifying. Nothing to propose or publish. Not " +
            "for an approval, a wait, a pass over many records or work split " +
            "across specialists: that is a Workflow (workflow_propose, then " +
            "workflow_id)."
        ),
      result_format: z
        .enum(PROMPT_ROUTINE_RESULTS)
        .optional()
        .describe(
          "What each run of a `prompt` routine leaves: `page` (a Markdown " +
            "page in Data, the default), `report` (an HTML report in Data), " +
            "or `data` (rows the owner writes into a Space table; an App on " +
            "that table shows them). Pages and reports keep one page per title."
        ),
      workflow_id: z
        .string()
        .optional()
        .describe(
          "The Workflow this routine runs, from workflows_list or a " +
            "workflow_propose result. A draft is fine: creating the routine " +
            "publishes it (a person's Approve does, where the Space asks one)."
        ),
      workflow_input: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Static input for the Workflow. A schedule carries nothing else — resolve a mailbox, an account or today's date inside the Workflow itself."
        ),
      agent_id: z
        .string()
        .optional()
        .describe(
          "The specialist that owns this job. Omit to own it yourself. A " +
            "coordinator or the copilot may name a mounted specialist; the " +
            "copilot and the coordinator are refused as owners."
        ),
      ask_first: z
        .boolean()
        .optional()
        .describe(
          "Pause on a card for the person to confirm before the routine " +
            "exists, even where the Space would let you create it directly. " +
            "Set it when the job is ambiguous, writes records, or was not " +
            "asked for in so many words."
        ),
      approval_grants: z
        .array(z.string())
        .optional()
        .describe(
          "Operation ids a fire may call without stopping to ask. Without these an unattended run parks on the first gated write. A person always confirms them on a card."
        ),
      cron: z
        .string()
        .optional()
        .describe("Cron expression. Required for kind=schedule."),
      description: z.string().optional().describe("One-line summary."),
      event_filter: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "For kind=event: top-level payload fields that must match, e.g. " +
            '{ "table_id": "<id>" } for a Space table event. Without it the ' +
            "routine wakes for every event of that name in the tenant."
        ),
      kind: triggerKindSchema,
      name: z.string().describe("The visible routine name."),
      outcomes: outcomesSchema.optional(),
      provider_id: z
        .enum(["module-events", "webhook"])
        .optional()
        .describe("Required for kind=event."),
      quiet_hours: z
        .string()
        .optional()
        .describe('UTC window it never fires in, as "HH:MM-HH:MM".'),
      report: reportSchema.default("desk_card"),
      resource: z
        .string()
        .optional()
        .describe(
          'The event name for module events, e.g. "contacts.contact.created" — ' +
            'or a Space table row event: "ai.data_table.row.created" / ' +
            '".updated" / ".deleted" (pin `event_filter: { table_id }`).'
        ),
      timezone: z.string().optional().describe("IANA timezone for the cron."),
    })
    .refine((body) => Boolean(body.prompt) !== Boolean(body.workflow_id), {
      message: "A routine runs a prompt or a Workflow — pass exactly one.",
      path: ["prompt"],
    });

  type CreateInput = z.infer<typeof createInputSchema>;

  /** Everything checked before either the card or the write. */
  interface PreparedCreate {
    ownerId: string;
    spaceId: string | null;
    tenantId: string;
    workflow: WorkflowRow | null;
    workflowPublished: boolean;
  }

  async function prepareCreate(
    input: CreateInput,
    workflows: WorkflowStore
  ): Promise<
    { ok: true; prepared: PreparedCreate } | { ok: false; note: string }
  > {
    const tenantId = requireTenant(ROUTINES_CREATE_TOOL_ID);
    const ctx = getEngentyToolsRunContext();
    if (input.kind === "schedule" && !input.cron) {
      return {
        ok: false,
        note: "A scheduled routine needs a cron expression.",
      };
    }
    const owner = await resolveOwner(callerScope(), input.agent_id);
    if (!owner.ok) {
      return owner;
    }
    try {
      if (input.cron) {
        assertValidSchedule(input.cron, input.timezone ?? null);
      }
    } catch (err) {
      // A refusal an agent can act on beats a thrown error it retries blindly.
      return {
        ok: false,
        note: err instanceof Error ? err.message : String(err),
      };
    }
    const outcomesNote = await checkOutcomes(input.outcomes);
    if (outcomesNote) {
      return { ok: false, note: outcomesNote };
    }
    let workflow: WorkflowRow | null = null;
    let workflowPublished = false;
    if (input.workflow_id) {
      workflow = await findWorkflow(workflows, input.workflow_id, tenantId);
      if (!workflow) {
        return {
          ok: false,
          note: `No Workflow '${input.workflow_id}' in this tenant. Use workflows_list and pass an id it returned.`,
        };
      }
      workflowPublished = Boolean(
        await workflows
          .getCurrent({ id: workflow.id, tenantId })
          .catch(() => null)
      );
    }
    // A routine belongs to the Space the run is claiming. An unresolved Space
    // reports no id at all, and that is the correct read: a routine parked
    // outside every Space would run against a surface nobody granted.
    return {
      ok: true,
      prepared: {
        ownerId: owner.id,
        spaceId: ctx.space?.spaceId ?? null,
        tenantId,
        workflow,
        workflowPublished,
      },
    };
  }

  /** The write, once nobody objects: bind the body, create, announce. */
  async function performCreate(input: {
    body: CreateInput;
    /** A person approved the card — the publish is theirs. */
    byHuman: boolean;
    prepared: PreparedCreate;
    workflows: WorkflowStore;
  }) {
    const { body, prepared, workflows } = input;
    const ctx = getEngentyToolsRunContext();
    const store = requireStore(deps);
    const triggerStore = requireTriggerStore(deps);
    const scope = await runScope();
    const userId = scope?.userId?.trim() || ctx.userId?.trim() || null;

    let workflowId: string;
    let published: "user" | "agent" | null = null;
    let publishNote = "";
    let enabled = true;
    if (body.prompt) {
      try {
        const bound = await materializePromptWorkflow({
          agentId: prepared.ownerId,
          prompt: body.prompt,
          ...(body.result_format ? { result: body.result_format } : {}),
          routineName: body.name,
          store: workflows,
          tenantId: prepared.tenantId,
          userId,
          validate: (definition) =>
            validateGraphAction(definition, capabilityOptions(scope)),
        });
        workflowId = bound.workflowId;
      } catch (err) {
        if (err instanceof PromptWorkflowInvalidError) {
          return refused(
            `The prompt could not be bound to a run: ${err.issues.map((i) => i.message).join("; ")}`
          );
        }
        throw err;
      }
    } else if (prepared.workflow) {
      workflowId = prepared.workflow.id;
      if (!prepared.workflowPublished) {
        const outcome = await publishForRoutine({
          approvedByUserId: userId,
          scope,
          store: workflows,
          tenantId: prepared.tenantId,
          workflow: prepared.workflow,
        });
        if (outcome.published) {
          published = input.byHuman ? "user" : "agent";
        } else {
          // Created, but asleep: a routine whose Workflow cannot be published
          // must not fire into a refusal at 03:00.
          enabled = false;
          publishNote =
            " The Workflow could not be published for this run — it stays a draft and the routine is DISABLED until a person publishes it on the canvas: " +
            outcome.issues
              .map((issue) =>
                typeof issue === "object" && issue && "message" in issue
                  ? String((issue as { message: unknown }).message)
                  : String(issue)
              )
              .join("; ");
        }
      }
    } else {
      return refused(
        "A routine runs a prompt or a Workflow — pass exactly one."
      );
    }

    const created = await store.create({
      workflowInput: body.workflow_input ?? {},
      agentId: prepared.ownerId,
      approvalGrants: body.approval_grants ?? [],
      createdByUserId: ctx.userId?.trim() || null,
      description: body.description ?? null,
      enabled,
      name: body.name,
      quietHours: body.quiet_hours ?? null,
      report: body.report,
      source: "custom",
      spaceId: prepared.spaceId,
      tenantId: prepared.tenantId,
      workflowId,
    });
    // The declared wake source, plus the standard manual/agent pair every
    // routine carries — the same defaults the create route applies. Declaring
    // `manual` or `agent` names the ONLY way this routine wakes, so it must
    // not also arrive as a duplicate of the pair.
    const createdTriggers: RoutineTriggerRow[] = [
      await triggerStore.create({
        cron: body.cron ?? null,
        eventFilter: body.event_filter ?? null,
        kind: body.kind,
        providerId: body.provider_id ?? null,
        resource: body.resource ?? null,
        routineId: created.id,
        tenantId: prepared.tenantId,
        timezone: body.timezone ?? null,
      }),
    ];
    for (const extraKind of ["manual", "agent"] as const) {
      if (extraKind === body.kind) {
        continue;
      }
      createdTriggers.push(
        await triggerStore.create({
          kind: extraKind,
          routineId: created.id,
          tenantId: prepared.tenantId,
        })
      );
    }

    // Compared against real rows, then rolled back — the alternative is
    // re-implementing the row shape in the comparator and drifting from it.
    const siblings = await store.list({
      tenantId: prepared.tenantId,
      ...(prepared.spaceId ? { spaceId: prepared.spaceId } : {}),
    });
    const grouped = await loadTriggers(deps, prepared.tenantId);
    const duplicate = findDuplicateRoutine(
      siblings.map((row) => ({
        routine: row,
        triggers: grouped.get(row.id) ?? [],
      })),
      { routine: created, triggers: createdTriggers }
    );
    if (duplicate) {
      await store.delete({ id: created.id, tenantId: prepared.tenantId });
      const duplicateOutcomes = await requireOutcomeStore(deps).list({
        routineId: duplicate.id,
        tenantId: prepared.tenantId,
      });
      return {
        note: `'${duplicate.name}' already wakes at the same time to run the same worker in this Space. Edit that routine instead. Do NOT retry with a shifted schedule or a different name to get around this.`,
        routine: toToolShape(
          duplicate,
          grouped.get(duplicate.id) ?? [],
          duplicateOutcomes
        ),
        status: "duplicate" as const,
      };
    }
    // Written once the routine is known to stay — the same replace path the
    // HTTP create uses.
    const createdOutcomes = body.outcomes?.length
      ? await writeOutcomes({
          bodies: body.outcomes,
          routineId: created.id,
          tenantId: prepared.tenantId,
        })
      : [];

    await announceCreated({
      ownerId: prepared.ownerId,
      published,
      routine: created,
      spaceId: prepared.spaceId,
      tenantId: prepared.tenantId,
      triggers: createdTriggers,
      workflowName: prepared.workflow?.title ?? prepared.workflow?.name ?? null,
    });

    return {
      // The schedule itself is reconciled within two minutes by the
      // scheduler-sync pass; saying so stops an agent reporting failure when
      // the first fire has simply not come round yet.
      note: `Routine created. Its schedule is picked up by the next scheduler sync (within ~2 minutes).${publishNote}`,
      routine: toToolShape(created, createdTriggers, createdOutcomes),
      status: "created" as const,
    };
  }

  const routinesListTool = createTool({
    id: ROUTINES_LIST_TOOL_ID,
    description:
      "List the routines in this Space — the jobs that run on their own. Call " +
      "this BEFORE routines_create so you extend or re-point an existing " +
      "routine instead of adding a second one that wakes at the same time. " +
      "You see your own; a coordinator and the copilot see the Space's.",
    inputSchema: z.object({
      agent_id: z
        .string()
        .optional()
        .describe(
          "Only this specialist's routines. Omit for every routine you may see."
        ),
    }),
    outputSchema: z.object({
      routines: z.array(routineOutputSchema),
    }),
    execute: async (input) => {
      const tenantId = requireTenant(ROUTINES_LIST_TOOL_ID);
      const store = requireStore(deps);
      const ctx = getEngentyToolsRunContext();
      const scope = callerScope();
      const spaceId = ctx.space?.spaceId ?? null;
      const agentId =
        scope.kind === "specialist" ? scope.id : input.agent_id?.trim();
      const rows = await store.list({
        tenantId,
        ...(spaceId ? { spaceId } : {}),
        ...(agentId ? { agentId } : {}),
      });
      const grouped = await loadTriggers(deps, tenantId);
      const destinations = await outcomesByRoutine(
        requireOutcomeStore(deps),
        tenantId
      );
      return {
        routines: rows.map((row) =>
          toToolShape(
            row,
            grouped.get(row.id) ?? [],
            destinations.get(row.id) ?? []
          )
        ),
      };
    },
  });

  const routinesCreateTool = createTool({
    id: ROUTINES_CREATE_TOOL_ID,
    description:
      "Create a routine: a standing job on a mounted Engenty — a wake source " +
      "plus what each run must achieve. Omit `agent_id` to own it yourself. " +
      "Body: `prompt` for a job the owner does in one go (the server runs " +
      "it, stores the result and delivers it — nothing to propose or " +
      "publish); `workflow_id` for an approval, a wait, a pass over many " +
      "records or several specialists — workflow_propose first, " +
      "then target its id here. A `schedule` needs `cron` + IANA `timezone`; " +
      "`event` needs `provider_id` + `resource`; `manual` / `agent` for a job " +
      "that must not run by itself. Say what done looks like in `outcome`. " +
      'Where the result goes is `outcomes`: "notify me" = a ' +
      "`notification.high` destination (bell + Space dashboard), a quiet " +
      "update = `notification.update`, email = `email` with `config.to`. " +
      "`report` is only the fallback for a routine without destinations — " +
      "a low-priority desk post, not on the bell. A show_widget inside a " +
      "scheduled run does not travel into a notification; the notification " +
      "carries the run's summary. Depending on this Space's approval mode the call " +
      "pauses on a card for a person to approve — report their answer, never " +
      "assume it; set `ask_first` to get that card anyway. `approval_grants` " +
      "always ask. Call routines_list first. Each fire starts a run; no task " +
      "is created.",
    inputSchema: createInputSchema,
    outputSchema: z.object({
      note: z.string().nullable(),
      routine: routineOutputSchema.nullable(),
      status: z.enum(["created", "duplicate", "refused", "declined"]),
    }),
    resumeSchema: requestDecisionResumeSchema,
    execute: async (input, executionContext) => {
      const workflows = (deps.workflows ?? createWorkflowStoreFromEnv)();
      if (!workflows) {
        return refused(
          "Workflow storage is unconfigured; the routine was not created."
        );
      }
      // Resume re-enters execute with the human's answer; the original
      // `await suspend()` below never continues.
      const resume = executionContext?.agent?.resumeData as
        | NativeRequestDecisionResumeData
        | undefined;
      if (resume) {
        releaseFrontendToolSuspendSlot(routineSuspendLockKey());
        if (readDecisionChoice(resume) !== "approve") {
          return {
            note: `The user did not approve the routine '${input.name}'. Nothing was created — do not retry with a different name or schedule.`,
            routine: null,
            status: "declined" as const,
          };
        }
        const prepared = await prepareCreate(input, workflows);
        if (!prepared.ok) {
          return refused(prepared.note);
        }
        return await performCreate({
          body: input,
          byHuman: true,
          prepared: prepared.prepared,
          workflows,
        });
      }

      const prepared = await prepareCreate(input, workflows);
      if (!prepared.ok) {
        return refused(prepared.note);
      }
      const ctx = getEngentyToolsRunContext();
      const mode = await approvalMode({
        agentTypeKey: prepared.prepared.ownerId,
        spaceId: prepared.prepared.spaceId,
        tenantId: prepared.prepared.tenantId,
      });
      const hasGrants = (input.approval_grants ?? []).length > 0;
      const canSuspend = Boolean(
        ctx.canSuspendForInteraction && executionContext?.agent?.suspend
      );
      const outcome = decideRoutineApproval({
        askFirst: input.ask_first === true,
        canSuspend,
        hasGrants,
        mode,
      });
      if (outcome === "refuse") {
        return refused(
          routineApprovalRefusalNote({
            coordinatorIds: coordinatorIdsForRun(),
            hasGrants,
            routineName: input.name,
          })
        );
      }
      if (outcome === "card") {
        await suspendRoutineDecision({
          artifact: routineDecisionArtifact({
            agentId: prepared.prepared.ownerId,
            approvalGrants: input.approval_grants ?? [],
            cron: input.cron ?? null,
            destinations: input.outcomes ?? [],
            kind: input.kind,
            name: input.name,
            prompt: input.prompt ?? null,
            providerId: input.provider_id ?? null,
            report: input.report,
            resource: input.resource ?? null,
            timezone: input.timezone ?? null,
            workflow: prepared.prepared.workflow
              ? {
                  name:
                    prepared.prepared.workflow.title ??
                    prepared.prepared.workflow.name,
                  needsPublish: !prepared.prepared.workflowPublished,
                }
              : null,
            ...(input.prompt
              ? { resultFormat: input.result_format ?? "page" }
              : {}),
            workflowGraph: await approvalWorkflowGraph({
              ownerId: prepared.prepared.ownerId,
              prompt: input.prompt ?? null,
              ...(input.result_format ? { result: input.result_format } : {}),
              store: workflows,
              tenantId: requireTenant(ROUTINES_CREATE_TOOL_ID),
              workflow: prepared.prepared.workflow ?? null,
            }),
          }),
          lockKey: routineSuspendLockKey(),
          suspend: executionContext?.agent?.suspend as (
            payload: unknown
          ) => Promise<unknown>,
        });
        return undefined as never;
      }
      return await performCreate({
        body: input,
        byHuman: false,
        prepared: prepared.prepared,
        workflows,
      });
    },
  });

  const routinesUpdateTool = createTool({
    id: ROUTINES_UPDATE_TOOL_ID,
    description:
      "Change an existing routine — its schedule, what each run does " +
      "(`prompt` for a prompt routine, `workflow_id` to rebind), its " +
      "outcome, its destinations (`outcomes` replaces the list — add " +
      "`notification.high` when the person wants to be notified), the " +
      "`report` fallback, whether it is enabled. Use routines_list " +
      "first to get the id. Every field lives directly on the routine; there " +
      "is no nested body. New `approval_grants` pause on a card for a person; " +
      "a new external destination (email, webhook, plugin) does so only where " +
      "this Space's approval mode asks.",
    inputSchema: z.object({
      prompt: z
        .string()
        .trim()
        .min(1)
        .max(PROMPT_ROUTINE_MAX_CHARS)
        .optional()
        .describe(
          "New body for a prompt routine (re-briefs its Workflow). Not for a canvas Workflow — revise that with workflow_self_revise."
        ),
      result_format: z
        .enum(PROMPT_ROUTINE_RESULTS)
        .optional()
        .describe(
          "What each run of a `prompt` routine leaves: `page` (a Markdown " +
            "page in Data, the default), `report` (an HTML report in Data), " +
            "or `data` (rows the owner writes into a Space table; an App on " +
            "that table shows them). Pages and reports keep one page per title."
        ),

      workflow_id: z
        .string()
        .optional()
        .describe("Rebind to a different published Workflow."),
      agent_id: z
        .string()
        .optional()
        .describe(
          "Hand the job to a different specialist. Must be a specialist, and mounted in this Space."
        ),
      approval_grants: z
        .array(z.string())
        .optional()
        .describe(
          "Replace the operation ids a fire may run without asking. Non-empty lists pause on a card for a person."
        ),
      cron: z.string().optional(),
      description: z.string().optional(),
      enabled: z.boolean().optional(),
      name: z.string().optional(),
      outcomes: outcomesSchema
        .optional()
        .describe(
          `${outcomesSchema.description} Present replaces the routine's ` +
            "destinations; [] removes them all, so the `report` fallback " +
            "applies again. Omit to leave them."
        ),
      quiet_hours: z.string().optional(),
      report: reportSchema.optional(),
      routine_id: z.string(),
      timezone: z.string().optional(),
    }),
    outputSchema: z.object({
      note: z.string().nullable(),
      routine: routineOutputSchema.nullable(),
      status: z.enum(["updated", "refused", "not_found", "declined"]),
    }),
    resumeSchema: requestDecisionResumeSchema,
    execute: async (input, executionContext) => {
      const tenantId = requireTenant(ROUTINES_UPDATE_TOOL_ID);
      const store = requireStore(deps);
      const existing = await store.get({ id: input.routine_id, tenantId });
      const resume = executionContext?.agent?.resumeData as
        | NativeRequestDecisionResumeData
        | undefined;
      if (resume) {
        releaseFrontendToolSuspendSlot(routineSuspendLockKey());
        if (readDecisionChoice(resume) !== "approve") {
          return {
            note: "The user did not approve the change. The routine is as it was.",
            routine: null,
            status: "declined" as const,
          };
        }
      }
      if (!existing) {
        return {
          note: `No routine ${input.routine_id} in this Space.`,
          routine: null,
          status: "not_found" as const,
        };
      }

      const scope = callerScope();
      if (!visibleTo(scope, existing)) {
        return refused(
          `Routine ${input.routine_id} belongs to ${existing.agent_id}, not to you.`
        );
      }
      const workflows = (deps.workflows ?? createWorkflowStoreFromEnv)();
      // A specialist owns its job: schedule, body, outcome, on/off. Handing
      // it to someone else is management work, and so is pointing it at a
      // Workflow that is not its own.
      if (scope.kind === "specialist") {
        if (input.agent_id !== undefined) {
          return refused(
            "You may change your routine, not hand it to someone else — that is management work. Ask a coordinator."
          );
        }
        if (input.workflow_id !== undefined && workflows) {
          const target = await findWorkflow(
            workflows,
            input.workflow_id,
            tenantId
          );
          if (target && target.owner_agent_id !== scope.id) {
            return refused(
              `Workflow '${input.workflow_id}' is not yours. Your routine may run only a Workflow you own — propose one with workflow_propose.`
            );
          }
        }
      }

      const outcomesNote = await checkOutcomes(input.outcomes);
      if (outcomesNote) {
        return refused(outcomesNote);
      }

      // New grants let a fire write with nobody watching: a person confirms
      // them, whatever the Space's mode says about the rest. A new external
      // destination (email, webhook, plugin providers) is low risk — usually
      // the user asked for it — so it asks only where the Space's mode does,
      // as creating the routine would.
      const grants = input.approval_grants ?? [];
      const hasGrants = grants.length > 0;
      const current =
        input.outcomes && !resume
          ? await requireOutcomeStore(deps).list({
              routineId: existing.id,
              tenantId,
            })
          : [];
      const external =
        !(resume || hasGrants) &&
        addsExternalDestination(input.outcomes ?? [], current);
      const approval =
        hasGrants || external
          ? decideRoutineApproval({
              askFirst: false,
              canSuspend: Boolean(
                getEngentyToolsRunContext().canSuspendForInteraction &&
                  executionContext?.agent?.suspend
              ),
              hasGrants,
              mode: hasGrants
                ? "manual"
                : await approvalMode({
                    agentTypeKey: existing.agent_id,
                    spaceId: existing.space_id,
                    tenantId,
                  }),
            })
          : "create";
      if (!resume && approval === "refuse") {
        return refused(
          routineApprovalRefusalNote({
            change: true,
            coordinatorIds: coordinatorIdsForRun(),
            external,
            hasGrants,
            routineName: existing.name,
          })
        );
      }
      if (!resume && approval === "card") {
        const triggers = await requireTriggerStore(deps).list({
          routineId: existing.id,
          tenantId,
        });
        const schedule = triggers.find((t) => t.kind === "schedule");
        const destinations = input.outcomes ?? current;
        await suspendRoutineDecision({
          artifact: routineDecisionArtifact({
            agentId: existing.agent_id,
            approvalGrants: grants,
            cron: input.cron ?? schedule?.cron ?? null,
            destinations,
            kind: schedule ? "schedule" : "manual",
            name: input.name ?? existing.name,
            report: input.report ?? existing.report,
            timezone: input.timezone ?? schedule?.timezone ?? null,
          }),
          lockKey: routineSuspendLockKey(),
          suspend: executionContext?.agent?.suspend as (
            payload: unknown
          ) => Promise<unknown>,
        });
        return undefined as never;
      }

      // A rebind must name a workflow that exists in this tenant.
      let rebindWorkflowId: string | undefined;
      if (input.workflow_id !== undefined) {
        const workflowRow = workflows
          ? await findWorkflow(workflows, input.workflow_id, tenantId)
          : null;
        if (!workflowRow) {
          return refused(
            `No Workflow '${input.workflow_id}' in this tenant. Use workflows_list and pass an id it returned.`
          );
        }
        rebindWorkflowId = workflowRow.id;
      }
      // A new prompt re-briefs the routine's own one-node Workflow — only
      // when it IS one; a canvas graph is revised as a graph.
      if (input.prompt !== undefined || input.result_format !== undefined) {
        if (!workflows) {
          return refused(
            "Workflow storage is unconfigured; the prompt was not changed."
          );
        }
        const current = await workflows
          .getCurrent({
            id: rebindWorkflowId ?? existing.workflow_id,
            tenantId,
          })
          .catch(() => null);
        if (!(current && isPromptWorkflowGraph(current.version.graph))) {
          return refused(
            "This routine runs a canvas Workflow, not a prompt. Change its steps with workflow_self_revise, or rebind it with workflow_id."
          );
        }
        const scopeForRun = await runScope();
        try {
          await materializePromptWorkflow({
            agentId: input.agent_id ?? existing.agent_id,
            prompt:
              input.prompt ??
              promptOfWorkflowGraph(current.version.graph) ??
              "",
            ...(input.result_format ? { result: input.result_format } : {}),
            routineName: input.name ?? existing.name,
            store: workflows,
            tenantId,
            userId:
              scopeForRun?.userId?.trim() ||
              getEngentyToolsRunContext().userId?.trim() ||
              null,
            validate: (definition) =>
              validateGraphAction(definition, capabilityOptions(scopeForRun)),
            workflowId: current.graph.id,
          });
        } catch (err) {
          if (err instanceof PromptWorkflowInvalidError) {
            return refused(
              `The prompt could not be bound to a run: ${err.issues.map((i) => i.message).join("; ")}`
            );
          }
          throw err;
        }
      }

      // Schedule edits land on the routine's schedule TRIGGER (created when the
      // routine gains its first cron).
      const triggerStore = requireTriggerStore(deps);
      const existingTriggers = await triggerStore.list({
        routineId: existing.id,
        tenantId,
      });
      const scheduleTrigger =
        existingTriggers.find((trigger) => trigger.kind === "schedule") ?? null;
      const cron = input.cron ?? scheduleTrigger?.cron ?? null;
      // Handing the job to someone else is still a routine being owned, so the
      // new owner clears the same bar the original did — resolved in the
      // registry first, exactly like a create.
      if (input.agent_id) {
        const owner = await resolveOwner(scope, input.agent_id);
        if (!owner.ok) {
          return refused(owner.note);
        }
      }
      try {
        if (cron && (input.cron || input.timezone)) {
          assertValidSchedule(
            cron,
            input.timezone ?? scheduleTrigger?.timezone ?? null
          );
        }
      } catch (err) {
        return refused(err instanceof Error ? err.message : String(err));
      }

      const updated = await store.update({
        id: existing.id,
        tenantId,
        ...(input.agent_id === undefined ? {} : { agentId: input.agent_id }),
        ...(input.approval_grants === undefined
          ? {}
          : { approvalGrants: input.approval_grants }),
        ...(rebindWorkflowId === undefined
          ? {}
          : { workflowId: rebindWorkflowId }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.quiet_hours === undefined
          ? {}
          : { quietHours: input.quiet_hours }),
        ...(input.report === undefined ? {} : { report: input.report }),
      });
      if (input.cron !== undefined || input.timezone !== undefined) {
        if (scheduleTrigger) {
          await triggerStore.update({
            id: scheduleTrigger.id,
            tenantId,
            ...(input.cron === undefined ? {} : { cron: input.cron }),
            ...(input.timezone === undefined
              ? {}
              : { timezone: input.timezone }),
          });
        } else if (input.cron) {
          await triggerStore.create({
            cron: input.cron,
            kind: "schedule",
            routineId: existing.id,
            tenantId,
            timezone: input.timezone ?? null,
          });
        }
      }
      const finalTriggers = await triggerStore.list({
        routineId: existing.id,
        tenantId,
      });
      const finalOutcomes = input.outcomes
        ? await writeOutcomes({
            bodies: input.outcomes,
            routineId: existing.id,
            tenantId,
          })
        : await requireOutcomeStore(deps).list({
            routineId: existing.id,
            tenantId,
          });

      return {
        note: null,
        routine: toToolShape(updated, finalTriggers, finalOutcomes),
        status: "updated" as const,
      };
    },
  });

  const routinesRunTool = createTool({
    id: ROUTINES_RUN_TOOL_ID,
    description:
      "Run a routine immediately, without waiting for its schedule — the " +
      'answer to "start / run the routine now"; do not do its job in the ' +
      "chat instead. Answers " +
      "with the started run's id, or with why nothing started — `disabled`, " +
      "`quiet_hours`, or `overlap` (the routine's previous run is still " +
      "active). Those are answers, not errors: report them as what happened. " +
      "On `overlap`, ask the person whether to cancel the open run " +
      "(`routines_cancel_run`) and start fresh; never cancel it unasked.",
    inputSchema: z.object({
      routine_id: z.string().describe("The routine to run. Use routines_list."),
    }),
    outputSchema: z.object({
      note: z.string().nullable(),
      run_id: z.string().nullable(),
      skipped: z.string().nullable(),
      status: z.enum(["started", "skipped", "refused", "not_found"]),
    }),
    execute: async (input) => {
      const tenantId = requireTenant(ROUTINES_RUN_TOOL_ID);
      const runCtx = getEngentyToolsRunContext();
      // A routine's own run must not re-fire its routine: the overlap guard
      // would skip it anyway mid-run, but near settle it would recurse — one
      // job forever restarting itself.
      if (runCtx.routineId && runCtx.routineId === input.routine_id) {
        return {
          note: "This run was started by that routine — it cannot restart itself.",
          run_id: null,
          skipped: null,
          status: "refused" as const,
        };
      }
      const store = requireStore(deps);
      const existing = await store.get({ id: input.routine_id, tenantId });
      if (!existing) {
        return {
          note: `No routine ${input.routine_id} in this Space.`,
          run_id: null,
          skipped: null,
          status: "not_found" as const,
        };
      }
      if (!visibleTo(callerScope(), existing)) {
        return {
          note: `Routine ${input.routine_id} belongs to ${existing.agent_id}, not to you.`,
          run_id: null,
          skipped: null,
          status: "refused" as const,
        };
      }
      const flowGraphs = (deps.workflows ?? createWorkflowStoreFromEnv)();
      const requests = (deps.workflowRuns ?? createWorkflowRunStoreFromEnv)();
      if (!(flowGraphs && requests)) {
        throw new Error("routine execution storage is not configured.");
      }
      // The chat that asked gets the result back, not only the routine's log.
      const callerThreadId =
        runCtx.userFacingThreadId ?? runCtx.orchestratorThreadId ?? null;
      const fired = await fireRoutine({
        ...(callerThreadId ? { callerThreadId } : {}),
        flowGraphs,
        // Run-now bypasses quiet hours by design — a person (or their
        // specialist, on their ask) is present right now.
        honorQuietHours: false,
        requests,
        routine: existing,
        routines: store,
        trigger: "direct",
      });
      if (fired.skipped) {
        return {
          note: null,
          run_id: null,
          skipped: fired.skipped,
          status: "skipped" as const,
        };
      }
      return {
        note: null,
        run_id: fired.runId ?? null,
        skipped: null,
        status: "started" as const,
      };
    },
  });

  const routinesCancelRunTool = createTool({
    id: ROUTINES_CANCEL_RUN_TOOL_ID,
    description:
      "Cancel a routine's open run — one still working or waiting on a " +
      'person — the answer to "cancel / stop the running routine". It is ' +
      "also what unblocks a start that `routines_run` skipped with " +
      "`overlap`. Only on the person's ask: what the run already wrote stays, " +
      "the rest of it never happens.",
    inputSchema: z.object({
      routine_id: z
        .string()
        .describe("The routine whose open run to cancel. Use routines_list."),
    }),
    outputSchema: z.object({
      note: z.string().nullable(),
      run_id: z.string().nullable(),
      status: z.enum([
        "cancelled",
        "none_active",
        "refused",
        "not_found",
        "version_missing",
      ]),
    }),
    execute: async (input) => {
      const tenantId = requireTenant(ROUTINES_CANCEL_RUN_TOOL_ID);
      const store = requireStore(deps);
      const existing = await store.get({ id: input.routine_id, tenantId });
      if (!existing) {
        return {
          note: `No routine ${input.routine_id} in this Space.`,
          run_id: null,
          status: "not_found" as const,
        };
      }
      if (!visibleTo(callerScope(), existing)) {
        return {
          note: `Routine ${input.routine_id} belongs to ${existing.agent_id}, not to you.`,
          run_id: null,
          status: "refused" as const,
        };
      }
      const flowGraphs = (deps.workflows ?? createWorkflowStoreFromEnv)();
      const requests = (deps.workflowRuns ?? createWorkflowRunStoreFromEnv)();
      if (!(flowGraphs && requests)) {
        throw new Error("routine execution storage is not configured.");
      }
      const result = await cancelActiveRoutineRun({
        flowGraphs,
        requests,
        routineId: existing.id,
        tenantId,
      });
      if (result.status === "none_active") {
        return {
          note: "No run of this routine is open.",
          run_id: null,
          status: "none_active" as const,
        };
      }
      return {
        note:
          result.status === "version_missing"
            ? "The run's workflow version is gone; it cannot be stopped here."
            : null,
        run_id: result.runId,
        status: result.status,
      };
    },
  });

  return {
    [ROUTINES_CANCEL_RUN_TOOL_ID]: routinesCancelRunTool,
    [ROUTINES_CREATE_TOOL_ID]: routinesCreateTool,
    [ROUTINES_LIST_TOOL_ID]: routinesListTool,
    [ROUTINES_RUN_TOOL_ID]: routinesRunTool,
    [ROUTINES_UPDATE_TOOL_ID]: routinesUpdateTool,
  };
}
