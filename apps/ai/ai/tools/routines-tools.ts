// routines_*: the jobs a mounted specialist runs on its own.
//
// A routine is an action to run plus a wake source. Firing it starts a RUN —
// it does not create a Task, and there is no work item standing in for the job.
// A specialist is complete without a routine; a routine is how it also works
// unattended.
//
// These replace the `triggers_*` operations, which put the wake source on one
// row and the job's body on a "standing task" — so every writer had to know
// which half a field lived in, and every fire left a card nobody could close.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  createRoutineStoreFromEnv,
  createRoutineTriggerStoreFromEnv,
  createWorkflowRunStoreFromEnv,
  createWorkflowStoreFromEnv,
} from "../../src/ai/index.js";
import { fireRoutine } from "../../src/ai/routines/fire-routine.js";
import {
  assertRoutineEligibleAgent,
  assertValidSchedule,
  findDuplicateRoutine,
} from "../../src/ai/routines/routine-validation.js";
import type { RoutineRow } from "../../src/dal/routines/routine-store.js";
import type { RoutineTriggerRow } from "../../src/dal/routines/routine-trigger-store.js";
import { resolveRegistryAgent } from "./engenty-tools/lib/registry-agent.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import { isUnresolvedSpaceGate } from "./engenty-tools/lib/space-gate.js";

export const ROUTINES_LIST_TOOL_ID = "routines_list";
export const ROUTINES_CREATE_TOOL_ID = "routines_create";
export const ROUTINES_UPDATE_TOOL_ID = "routines_update";
export const ROUTINES_RUN_TOOL_ID = "routines_run";

/**
 * The two management surfaces see and steer every routine; a specialist sees
 * and steers only its own. Same tool objects for everyone — the registry is
 * global — so the narrowing happens here, from the run's own agent identity,
 * not from which agent declared the tool.
 */
const MANAGEMENT_AGENT_IDS = new Set(["engenty.copilot"]);

/** The calling specialist's own id, or null for a management agent. */
function callerSpecialistId(): string | null {
  // `agentTypeKey` is the registry key routines are stored under
  // ("news.orf-briefing"); `agentId` is the core.agents AUTHORIZATION uuid —
  // scoping on it filtered every specialist down to zero routines.
  const agentTypeKey = getEngentyToolsRunContext().agentTypeKey?.trim() ?? "";
  if (!agentTypeKey || MANAGEMENT_AGENT_IDS.has(agentTypeKey)) {
    return null;
  }
  return agentTypeKey;
}

function requireTenant(toolId: string): string {
  const tenantId = getEngentyToolsRunContext().tenantId?.trim();
  if (!tenantId) {
    throw new Error(`${toolId} is unavailable in this run (no tenant).`);
  }
  return tenantId;
}

function requireStore() {
  const store = createRoutineStoreFromEnv();
  if (!store) {
    throw new Error("routine storage is not configured.");
  }
  return store;
}

function requireTriggerStore() {
  const store = createRoutineTriggerStoreFromEnv();
  if (!store) {
    throw new Error("routine storage is not configured.");
  }
  return store;
}

/** The shape an agent reads back: the routine plus its wake sources. */
function toToolShape(routine: RoutineRow, triggers: RoutineTriggerRow[]) {
  return {
    agent_id: routine.agent_id,
    enabled: routine.enabled,
    last_fired_at: routine.last_fired_at,
    last_result: routine.last_result,
    name: routine.name,
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
  enabled: z.boolean(),
  last_fired_at: z.string().nullable(),
  last_result: z.string().nullable(),
  name: z.string(),
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
  tenantId: string
): Promise<Map<string, RoutineTriggerRow[]>> {
  const rows = await requireTriggerStore().list({ tenantId });
  const map = new Map<string, RoutineTriggerRow[]>();
  for (const row of rows) {
    const list = map.get(row.routine_id) ?? [];
    list.push(row);
    map.set(row.routine_id, list);
  }
  return map;
}

export const routinesListTool = createTool({
  id: ROUTINES_LIST_TOOL_ID,
  description:
    "List the routines in this Space — the jobs that run on their own. Call " +
    "this BEFORE routines_create so you extend or re-point an existing " +
    "routine instead of adding a second one that wakes at the same time.",
  inputSchema: z.object({
    agent_id: z
      .string()
      .optional()
      .describe("Only routines owned by this specialist."),
  }),
  outputSchema: z.object({ routines: z.array(routineOutputSchema) }),
  execute: async (input) => {
    const tenantId = requireTenant(ROUTINES_LIST_TOOL_ID);
    // A specialist lists ITS jobs — whatever agent_id it asked for.
    const own = callerSpecialistId();
    const rows = await requireStore().list({
      tenantId,
      ...(own
        ? { agentId: own }
        : input.agent_id
          ? { agentId: input.agent_id }
          : {}),
    });
    const grouped = await loadTriggers(tenantId);
    return {
      routines: rows.map((row) => toToolShape(row, grouped.get(row.id) ?? [])),
    };
  },
});

export const routinesCreateTool = createTool({
  id: ROUTINES_CREATE_TOOL_ID,
  description:
    "Create a routine: a job on a mounted Engenty with a wake source. This is " +
    "what makes a hire actually runnable — nothing happens until this " +
    "returns. Every routine names an `workflow_id` — the published Workflow " +
    "it runs; there is no prose lane. For a new job, call " +
    "workflow_propose first and target its id here. A schedule needs `cron` " +
    "plus an IANA `timezone`; a job with no clock behind it takes " +
    '`kind: "manual"` and no cron. Every routine is pressable and ' +
    "askable either way. Each fire starts a run; no task is created.",
  inputSchema: z.object({
    workflow_id: z
      .string()
      .describe(
        "The published Workflow this routine runs. Use workflows_list to find one."
      ),
    workflow_input: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Static input for the Workflow. A schedule carries nothing else — resolve a mailbox, an account or today's date inside the Workflow itself."
      ),
    agent_id: z
      .string()
      .describe(
        "The specialist that owns this job. Must be mounted in this Space, and must be a specialist — the copilot and the coordinator are refused."
      ),
    approval_grants: z
      .array(z.string())
      .optional()
      .describe(
        "Operation ids a fire may call without stopping to ask. Without these an unattended run parks on the first gated write."
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
    kind: z
      .enum(["schedule", "event", "manual", "agent"])
      .default("schedule")
      .describe(
        "What wakes it. `schedule` = a clock (needs cron + timezone), " +
          "`event` = a module event (needs provider_id). `manual` = nothing " +
          "wakes it on its own: it runs when a person presses it. `agent` = " +
          "it runs when someone asks for it in chat. Use manual or agent for " +
          "a job that should exist and be runnable but must NOT run by " +
          "itself — never invent a cron to satisfy this field."
      ),
    name: z.string().describe("The visible routine name."),
    outcome: z
      .string()
      .optional()
      .describe("What a fire must have achieved to count as done."),
    provider_id: z
      .enum(["module-events", "webhook"])
      .optional()
      .describe("Required for kind=event."),
    quiet_hours: z
      .string()
      .optional()
      .describe('UTC window it never fires in, as "HH:MM-HH:MM".'),
    report: z
      .enum(["quiet", "desk_card", "ask"])
      .default("desk_card")
      .describe(
        "How loudly a run's result lands in the owner's chat: quiet posts " +
          "nothing, desk_card posts the result. `ask` reports like desk_card " +
          "— pausing mid-run is the agent's own act (routine_ask), never " +
          "forced by this knob. Failures always report, whatever this says."
      ),
    resource: z
      .string()
      .optional()
      .describe(
        'The event name for module events, e.g. "contacts.contact.created" — ' +
          'or a Space table row event: "ai.data_table.row.created" / ' +
          '".updated" / ".deleted" (pin `event_filter: { table_id }`).'
      ),
    timezone: z.string().optional().describe("IANA timezone for the cron."),
  }),
  outputSchema: z.object({
    note: z.string().nullable(),
    routine: routineOutputSchema.nullable(),
    status: z.enum(["created", "duplicate", "refused"]),
  }),
  execute: async (input) => {
    const tenantId = requireTenant(ROUTINES_CREATE_TOOL_ID);
    const store = requireStore();
    const ctx = getEngentyToolsRunContext();

    if (input.kind === "schedule" && !input.cron) {
      return {
        note: "A scheduled routine needs a cron expression.",
        routine: null,
        status: "refused" as const,
      };
    }

    const owner = await resolveRegistryAgent(input.agent_id);
    if (owner === null) {
      return {
        note: `No agent '${input.agent_id}' in this tenant's registry. Use registry_agents_list and pass an id it returned.`,
        routine: null,
        status: "refused" as const,
      };
    }
    if (owner === undefined) {
      return {
        note: "The agent registry is unreachable; the routine was not created. Try again.",
        routine: null,
        status: "refused" as const,
      };
    }
    // The mount gate: in a resolved Space only a MOUNTED specialist can own
    // standing work here. A global run stays tenant-wide by intention.
    const createSpace =
      ctx.space && !isUnresolvedSpaceGate(ctx.space) ? ctx.space : null;
    if (createSpace && !(createSpace.agentIds?.has(input.agent_id) ?? false)) {
      return {
        note: `${input.agent_id} is not mounted in this Space, so it cannot own a routine here. Mount it via space_setup or pick a specialist from registry_agents_list.`,
        routine: null,
        status: "refused" as const,
      };
    }
    try {
      assertRoutineEligibleAgent(owner, "custom");
      if (input.cron) {
        assertValidSchedule(input.cron, input.timezone ?? null);
      }
    } catch (err) {
      // A refusal an agent can act on beats a thrown error it retries blindly.
      return {
        note: err instanceof Error ? err.message : String(err),
        routine: null,
        status: "refused" as const,
      };
    }

    // The binding names a workflow — by module workflow id ("contacts.
    // research") or by the flow graph's own uuid. Resolved here so the row
    // always stores the uuid.
    const flowGraphs = createWorkflowStoreFromEnv();
    if (!flowGraphs) {
      return {
        note: "Workflow storage is unconfigured; the routine was not created.",
        routine: null,
        status: "refused" as const,
      };
    }
    const requestedActionId = input.workflow_id.trim();
    const workflowRow =
      (await flowGraphs
        .findBySourceWorkflow({
          sourceWorkflowId: requestedActionId,
          tenantId,
        })
        .catch(() => null)) ??
      (await flowGraphs
        .getGraph({ id: requestedActionId, tenantId })
        .catch(() => null));
    if (!workflowRow) {
      return {
        note: `No Workflow '${requestedActionId}' in this tenant. Use workflows_list and pass an id it returned.`,
        routine: null,
        status: "refused" as const,
      };
    }

    // A routine belongs to the Space the run is claiming. An unresolved Space
    // reports no id at all, and that is the correct read: a routine parked
    // outside every Space would run against a surface nobody granted.
    const spaceId = ctx.space?.spaceId ?? null;
    const triggerStore = requireTriggerStore();
    const created = await store.create({
      workflowInput: input.workflow_input ?? {},
      agentId: input.agent_id,
      approvalGrants: input.approval_grants ?? [],
      createdByUserId: ctx.userId?.trim() || null,
      description: input.description ?? null,
      name: input.name,
      outcome: input.outcome ?? null,
      quietHours: input.quiet_hours ?? null,
      report: input.report,
      source: "custom",
      spaceId,
      tenantId,
      workflowId: workflowRow.id,
    });
    // The declared wake source, plus the standard manual/agent pair every
    // routine carries — the same defaults the create route applies. Declaring
    // `manual` or `agent` names the ONLY way this routine wakes, so it must
    // not also arrive as a duplicate of the pair.
    const createdTriggers: RoutineTriggerRow[] = [
      await triggerStore.create({
        cron: input.cron ?? null,
        eventFilter: input.event_filter ?? null,
        kind: input.kind,
        providerId: input.provider_id ?? null,
        resource: input.resource ?? null,
        routineId: created.id,
        tenantId,
        timezone: input.timezone ?? null,
      }),
    ];
    for (const extraKind of ["manual", "agent"] as const) {
      if (extraKind === input.kind) {
        continue;
      }
      createdTriggers.push(
        await triggerStore.create({
          kind: extraKind,
          routineId: created.id,
          tenantId,
        })
      );
    }

    // Compared against real rows, then rolled back — the alternative is
    // re-implementing the row shape in the comparator and drifting from it.
    const siblings = await store.list({
      tenantId,
      ...(spaceId ? { spaceId } : {}),
    });
    const grouped = await loadTriggers(tenantId);
    const duplicate = findDuplicateRoutine(
      siblings.map((row) => ({
        routine: row,
        triggers: grouped.get(row.id) ?? [],
      })),
      { routine: created, triggers: createdTriggers }
    );
    if (duplicate) {
      await store.delete({ id: created.id, tenantId });
      return {
        note: `'${duplicate.name}' already wakes at the same time to run the same worker in this Space. Edit that routine instead. Do NOT retry with a shifted schedule or a different name to get around this.`,
        routine: toToolShape(duplicate, grouped.get(duplicate.id) ?? []),
        status: "duplicate" as const,
      };
    }

    // Targeting a DRAFT Workflow is legal — that is exactly what the multi-step
    // hire flow produces (workflow_propose saves unapproved; a human publishes
    // on the canvas). But it must be SAID: runs refuse loudly until the
    // publish, and a note the agent relays beats a 03:00 surprise.
    let publishGateNote = "";
    {
      const published = await flowGraphs
        .getCurrent({ id: workflowRow.id, tenantId })
        .catch(() => null);
      if (!published) {
        publishGateNote =
          " The targeted Workflow has no published version yet — tell the user to review and publish it; runs will refuse until then.";
      }
    }

    return {
      // The schedule itself is reconciled within two minutes by the
      // scheduler-sync pass; saying so stops an agent reporting failure when
      // the first fire has simply not come round yet.
      note: `Routine created. Its schedule is picked up by the next scheduler sync (within ~2 minutes).${publishGateNote}`,
      routine: toToolShape(created, createdTriggers),
      status: "created" as const,
    };
  },
});

export const routinesUpdateTool = createTool({
  id: ROUTINES_UPDATE_TOOL_ID,
  description:
    "Change an existing routine — its schedule, its Workflow, whether it is " +
    "enabled. Use routines_list first to get the id. Every field lives " +
    "directly on the routine; there is no nested body.",
  inputSchema: z.object({
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
    cron: z.string().optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    name: z.string().optional(),
    outcome: z.string().optional(),
    quiet_hours: z.string().optional(),
    report: z.enum(["quiet", "desk_card", "ask"]).optional(),
    routine_id: z.string(),
    timezone: z.string().optional(),
  }),
  outputSchema: z.object({
    note: z.string().nullable(),
    routine: routineOutputSchema.nullable(),
    status: z.enum(["updated", "refused", "not_found"]),
  }),
  execute: async (input) => {
    const tenantId = requireTenant(ROUTINES_UPDATE_TOOL_ID);
    const store = requireStore();
    const existing = await store.get({ id: input.routine_id, tenantId });
    if (!existing) {
      return {
        note: `No routine ${input.routine_id} in this Space.`,
        routine: null,
        status: "not_found" as const,
      };
    }

    // A specialist adjusts its own jobs — schedule, description, on/off —
    // and nothing else's. Retargeting (a new owner, a new body) is
    // management-surface work even on its own routine: changing WHAT runs is
    // a governance act, changing WHEN is not.
    const own = callerSpecialistId();
    if (own) {
      if (existing.agent_id !== own) {
        return {
          note: `Routine ${input.routine_id} belongs to ${existing.agent_id}, not to you.`,
          routine: null,
          status: "refused" as const,
        };
      }
      const retargeting =
        input.workflow_id !== undefined || input.agent_id !== undefined;
      if (retargeting) {
        return {
          note: "You may change your routine's schedule, description and enabled state — retargeting it is management work. Ask the owner to do it from the routine's page.",
          routine: null,
          status: "refused" as const,
        };
      }
    }

    // A rebind must name a workflow that exists in this tenant.
    let rebindWorkflowId: string | undefined;
    if (input.workflow_id !== undefined) {
      const flowGraphs = createWorkflowStoreFromEnv();
      const requested = input.workflow_id.trim();
      const workflowRow = flowGraphs
        ? ((await flowGraphs
            .findBySourceWorkflow({ sourceWorkflowId: requested, tenantId })
            .catch(() => null)) ??
          (await flowGraphs
            .getGraph({ id: requested, tenantId })
            .catch(() => null)))
        : null;
      if (!workflowRow) {
        return {
          note: `No Workflow '${requested}' in this tenant. Use workflows_list and pass an id it returned.`,
          routine: null,
          status: "refused" as const,
        };
      }
      rebindWorkflowId = workflowRow.id;
    }

    // Schedule edits land on the routine's schedule TRIGGER (created when the
    // routine gains its first cron).
    const triggerStore = requireTriggerStore();
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
    let reassignOwner: Awaited<ReturnType<typeof resolveRegistryAgent>>;
    if (input.agent_id) {
      reassignOwner = await resolveRegistryAgent(input.agent_id);
      if (reassignOwner === null) {
        return {
          note: `No agent '${input.agent_id}' in this tenant's registry. Use registry_agents_list and pass an id it returned.`,
          routine: null,
          status: "refused" as const,
        };
      }
      if (reassignOwner === undefined) {
        return {
          note: "The agent registry is unreachable; the routine was not updated. Try again.",
          routine: null,
          status: "refused" as const,
        };
      }
      const updateCtx = getEngentyToolsRunContext();
      const updateSpace =
        updateCtx.space && !isUnresolvedSpaceGate(updateCtx.space)
          ? updateCtx.space
          : null;
      if (
        updateSpace &&
        input.agent_id &&
        !(updateSpace.agentIds?.has(input.agent_id) ?? false)
      ) {
        return {
          note: `${input.agent_id} is not mounted in this Space, so it cannot own a routine here. Mount it via space_setup or pick a specialist from registry_agents_list.`,
          routine: null,
          status: "refused" as const,
        };
      }
    }
    try {
      if (cron && (input.cron || input.timezone)) {
        assertValidSchedule(
          cron,
          input.timezone ?? scheduleTrigger?.timezone ?? null
        );
      }
      if (reassignOwner) {
        assertRoutineEligibleAgent(reassignOwner, existing.source);
      }
    } catch (err) {
      return {
        note: err instanceof Error ? err.message : String(err),
        routine: null,
        status: "refused" as const,
      };
    }

    const updated = await store.update({
      id: existing.id,
      tenantId,
      ...(input.agent_id === undefined ? {} : { agentId: input.agent_id }),
      ...(rebindWorkflowId === undefined
        ? {}
        : { workflowId: rebindWorkflowId }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
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
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
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

    return {
      note: null,
      routine: toToolShape(updated, finalTriggers),
      status: "updated" as const,
    };
  },
});

export const routinesRunTool = createTool({
  id: ROUTINES_RUN_TOOL_ID,
  description:
    "Run a routine immediately, without waiting for its schedule. Answers " +
    "with the started run's id, or with why nothing started — `disabled`, " +
    "`quiet_hours`, or `overlap` (the routine's previous run is still " +
    "active). Those are answers, not errors: report them as what happened.",
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
    const store = requireStore();
    const existing = await store.get({ id: input.routine_id, tenantId });
    if (!existing) {
      return {
        note: `No routine ${input.routine_id} in this Space.`,
        run_id: null,
        skipped: null,
        status: "not_found" as const,
      };
    }
    const own = callerSpecialistId();
    if (own && existing.agent_id !== own) {
      return {
        note: `Routine ${input.routine_id} belongs to ${existing.agent_id}, not to you.`,
        run_id: null,
        skipped: null,
        status: "refused" as const,
      };
    }
    const flowGraphs = createWorkflowStoreFromEnv();
    const requests = createWorkflowRunStoreFromEnv();
    if (!(flowGraphs && requests)) {
      throw new Error("routine execution storage is not configured.");
    }
    const fired = await fireRoutine({
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

export function createRoutineTools() {
  return {
    [ROUTINES_CREATE_TOOL_ID]: routinesCreateTool,
    [ROUTINES_LIST_TOOL_ID]: routinesListTool,
    [ROUTINES_RUN_TOOL_ID]: routinesRunTool,
    [ROUTINES_UPDATE_TOOL_ID]: routinesUpdateTool,
  };
}
