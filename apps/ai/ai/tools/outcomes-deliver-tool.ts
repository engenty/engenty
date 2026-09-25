// In-run delivery of this fire's outcome bindings.
//
// Bound to THIS routine at construction — the model cannot name another
// routine's destinations. `always` bindings may be called early; settle
// skips any binding already delivered for the fire.
import type { DynamicAiModuleCapabilityLoader } from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  createRoutineOutcomeDeliveryStoreFromEnv,
  createThreadStoreFromEnv,
} from "../../src/ai/index.js";
import { createDefaultModuleCapabilityLoader } from "../../src/ai/module-capability-loader.js";
import { resolveOutcomeProvider } from "../../src/ai/routines/outcomes/catalog.js";
import { BUILTIN_OUTCOME_PROVIDERS } from "../../src/ai/routines/outcomes/definitions.js";
import { deliverOutcome } from "../../src/ai/routines/outcomes/dispatch.js";
import type { OutcomeEnvelope } from "../../src/ai/routines/outcomes/envelope.js";
import { AGENT_IDEMPOTENCY_KEY } from "../../src/ai/routines/outcomes/ids.js";
import type { RoutineOutcomeRow } from "../../src/dal/routines/routine-outcome-store.js";
import type { RoutineStore } from "../../src/dal/routines/routine-store.js";

export const OUTCOMES_DELIVER_TOOL_ID = "outcomes_deliver";

export interface OutcomesDeliverToolDeps {
  bindings: RoutineOutcomeRow[];
  /** The graph run the step belongs to (Mastra's run id is ours). */
  graphRunId: string | null;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  requestId: string;
  routineId: string;
  routines: Pick<RoutineStore, "get">;
  tenantId: string;
  /** The routine's chat, where the run's transcript is. */
  threadId: string;
}

function payloadHint(providerId: string): string {
  const builtin = BUILTIN_OUTCOME_PROVIDERS.find(
    (provider) => provider.id === providerId
  );
  return builtin
    ? JSON.stringify(builtin.payloadSchema)
    : "plugin payload (see GET /ai/v1/outcome-providers)";
}

function describeBindings(bindings: RoutineOutcomeRow[]): string {
  const agent = bindings.filter((row) => row.mode === "agent" && row.enabled);
  if (agent.length === 0) {
    return "This routine has no agent-mode destinations. You may still call an always-binding early.";
  }
  return agent
    .map(
      (row) =>
        `- ${row.id} (${row.provider_id}, mode=${row.mode}) payload: ${payloadHint(row.provider_id)}`
    )
    .join("\n");
}

export function createOutcomesDeliverTool(deps: OutcomesDeliverToolDeps) {
  const description =
    "Deliver this fire's result to one of the routine's outcome bindings. " +
    "Only bindings on THIS routine are accepted. Prefer agent-mode bindings " +
    "when nothing important happened (do not call them). Always-mode bindings " +
    "fire at settle if you skip them.\n\nBindings:\n" +
    describeBindings(deps.bindings);

  return {
    [OUTCOMES_DELIVER_TOOL_ID]: createTool({
      id: OUTCOMES_DELIVER_TOOL_ID,
      description,
      inputSchema: z.object({
        idempotency_key: z.string().min(1).max(128).optional(),
        outcome_id: z.string().uuid(),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
      outputSchema: z.object({
        already: z.boolean(),
        delivered: z.boolean(),
        error: z.string().nullable(),
      }),
      execute: async (input) => {
        const binding = deps.bindings.find(
          (row) => row.id === input.outcome_id
        );
        if (!binding?.enabled) {
          return {
            already: false,
            delivered: false,
            error: "outcome_id is not an enabled binding on this routine",
          };
        }
        const routine = await deps.routines.get({
          id: deps.routineId,
          tenantId: deps.tenantId,
        });
        if (!routine) {
          return {
            already: false,
            delivered: false,
            error: "routine not found",
          };
        }
        const moduleLoader =
          deps.moduleLoader ?? createDefaultModuleCapabilityLoader();
        const provider = await resolveOutcomeProvider(
          binding.provider_id,
          moduleLoader
        );
        const summary =
          typeof input.payload?.summary === "string"
            ? input.payload.summary
            : null;
        const body =
          typeof input.payload?.body === "string" ? input.payload.body : null;
        const envelope: OutcomeEnvelope = {
          agent_id: routine.agent_id,
          artifact: null,
          awaiting_review: false,
          body,
          graph_run_id: deps.graphRunId,
          outcome: null,
          reason: null,
          routine_id: routine.id,
          routine_name: routine.name,
          run_id: deps.requestId,
          space_id: routine.space_id,
          status: "completed",
          summary,
          thread_id: deps.threadId,
        };
        const result = await deliverOutcome({
          binding,
          deliveries: createRoutineOutcomeDeliveryStoreFromEnv(),
          envelope,
          idempotencyKey: input.idempotency_key ?? AGENT_IDEMPOTENCY_KEY,
          moduleLoader,
          payload: input.payload ?? {},
          ...(provider ? { provider } : {}),
          requestId: deps.requestId,
          routine,
          threadStore: createThreadStoreFromEnv(),
        });
        return {
          already: result.already,
          delivered: result.ok,
          error: result.error ?? null,
        };
      },
    }),
  };
}

export const OUTCOMES_DELIVER_GUIDANCE = `## Outcome destinations
- Call \`${OUTCOMES_DELIVER_TOOL_ID}\` for each **agent-mode** binding that should fire. If nothing important happened, do not call it — settle will not ping those destinations.
- Always-mode bindings fire when the run settles. You may call them early; settle skips a binding already delivered.`;
