import type {
  DynamicAiModuleCapabilityLoader,
  OutcomeProviderDefinition,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { ArtifactStore } from "../../../dal/artifacts/artifact-store.js";
import type { RoutineOutcomeDeliveryStore } from "../../../dal/routines/routine-outcome-delivery-store.js";
import type { RoutineOutcomeRow } from "../../../dal/routines/routine-outcome-store.js";
import type { RoutineRow } from "../../../dal/routines/routine-store.js";
import type { ThreadStore } from "../../../dal/threads/thread-store.js";
import type { WorkflowRunStore } from "../../../dal/workflow-runs/workflow-run-store.js";
import { createSchedulerOperationInvoker } from "../../../scheduler/service-invoker.js";
import {
  createArtifactStoreFromEnv,
  createRoutineOutcomeDeliveryStoreFromEnv,
  createThreadStoreFromEnv,
  createWorkflowRunStoreFromEnv,
} from "../../index.js";
import { resolveOutcomeProvider } from "./catalog.js";
import type { OutcomeEnvelope } from "./envelope.js";
import { outcomeEnvelopeToWire } from "./envelope.js";
import {
  BUILTIN_OUTCOME_HANDLERS,
  type OutcomeHandler,
  type OutcomeHandlerContext,
  type OutcomeOperationInvoker,
} from "./handlers.js";
import {
  FAILURE_FLOOR_IDEMPOTENCY_KEY,
  NOTIFICATION_HIGH_PROVIDER_ID,
  SETTLE_IDEMPOTENCY_KEY,
} from "./ids.js";
import { validateAgainstJsonSchema } from "./validate.js";

const logger = createLogger({ name: "routine-outcome-dispatch" });

export interface DeliverOutcomeInput {
  artifacts?: Pick<ArtifactStore, "get"> | null;
  binding: RoutineOutcomeRow;
  deliveries?: RoutineOutcomeDeliveryStore | null;
  envelope: OutcomeEnvelope;
  fetchImpl?: typeof fetch;
  handlers?: Record<string, OutcomeHandler>;
  idempotencyKey: string;
  invoke?: OutcomeOperationInvoker;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  payload?: Record<string, unknown>;
  provider?: OutcomeProviderDefinition;
  requestId: string;
  routine: RoutineRow;
  threadStore?: ThreadStore | null;
  workflowRuns?: Pick<WorkflowRunStore, "setArtifactPointer"> | null;
}

export interface DeliverOutcomeResult {
  already: boolean;
  error?: string;
  ok: boolean;
}

function defaultInvoker(routine: RoutineRow): OutcomeOperationInvoker {
  const invoke = createSchedulerOperationInvoker(routine.tenant_id, {
    routineId: routine.id,
    ...(routine.space_id ? { spaceId: routine.space_id } : {}),
  });
  return (operationId, input) => invoke(operationId, input);
}

export async function deliverOutcome(
  input: DeliverOutcomeInput
): Promise<DeliverOutcomeResult> {
  const deliveries =
    input.deliveries === undefined
      ? createRoutineOutcomeDeliveryStoreFromEnv()
      : input.deliveries;
  if (!deliveries) {
    return { already: false, error: "delivery store unavailable", ok: false };
  }
  const provider =
    input.provider ??
    (await resolveOutcomeProvider(
      input.binding.provider_id,
      input.moduleLoader
    ));
  if (!provider) {
    return {
      already: false,
      error: `unknown outcome provider '${input.binding.provider_id}'`,
      ok: false,
    };
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = validateAgainstJsonSchema(
      provider.payloadSchema,
      input.payload ?? {},
      `${provider.id} payload`
    );
  } catch (err) {
    return {
      already: false,
      error: err instanceof Error ? err.message : String(err),
      ok: false,
    };
  }

  const claimed = await deliveries.claim({
    idempotencyKey: input.idempotencyKey,
    outcomeId: input.binding.id,
    runId: input.envelope.run_id,
    tenantId: input.routine.tenant_id,
  });
  if (!claimed.created && claimed.row.status === "sent") {
    return { already: true, ok: true };
  }
  if (!claimed.created && claimed.row.status === "pending") {
    return { already: true, ok: true };
  }

  const invoke = input.invoke ?? defaultInvoker(input.routine);
  const ctx: OutcomeHandlerContext = {
    artifacts:
      input.artifacts === undefined
        ? createArtifactStoreFromEnv()
        : input.artifacts,
    binding: input.binding,
    envelope: input.envelope,
    invoke,
    payload,
    requestId: input.requestId,
    routine: input.routine,
    threadStore:
      input.threadStore === undefined
        ? createThreadStoreFromEnv()
        : input.threadStore,
    workflowRuns:
      input.workflowRuns === undefined
        ? createWorkflowRunStoreFromEnv()
        : input.workflowRuns,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  };

  try {
    if (provider.operationId) {
      await invoke(provider.operationId, {
        config: input.binding.config,
        envelope: outcomeEnvelopeToWire(input.envelope),
        payload,
      });
    } else {
      const handler = (input.handlers ?? BUILTIN_OUTCOME_HANDLERS)[provider.id];
      if (!handler) {
        throw new Error(`no in-process handler for '${provider.id}'`);
      }
      await handler(ctx);
    }
    await deliveries.mark({
      id: claimed.row.id,
      status: "sent",
      tenantId: input.routine.tenant_id,
    });
    return { already: false, ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn("routine outcome delivery failed", {
      error,
      outcomeId: input.binding.id,
      providerId: input.binding.provider_id,
      runId: input.envelope.run_id,
    });
    await deliveries.mark({
      error: error.slice(0, 2000),
      id: claimed.row.id,
      status: "failed",
      tenantId: input.routine.tenant_id,
    });
    return { already: false, error, ok: false };
  }
}

export function needsFailureFloor(input: {
  outcome?: string | null;
  status: "completed" | "failed";
}): boolean {
  return (
    input.status === "failed" ||
    input.outcome === "failed" ||
    input.outcome === "rejected" ||
    input.outcome === "needs_attention"
  );
}

export interface DispatchSettleOutcomesInput {
  artifacts?: Pick<ArtifactStore, "get"> | null;
  bindings: RoutineOutcomeRow[];
  deliveries?: RoutineOutcomeDeliveryStore | null;
  envelope: OutcomeEnvelope;
  fetchImpl?: typeof fetch;
  handlers?: Record<string, OutcomeHandler>;
  invoke?: OutcomeOperationInvoker;
  moduleLoader?: DynamicAiModuleCapabilityLoader;
  requestId: string;
  routine: RoutineRow;
  threadStore?: ThreadStore | null;
  workflowRuns?: Pick<WorkflowRunStore, "setArtifactPointer"> | null;
}

/**
 * Fire enabled `always` bindings, then the failure floor:
 * `notification.high` if the routine has one and it has not sent, otherwise
 * the caller posts the legacy desk card.
 *
 * Returns whether the failure floor still needs a desk post.
 */
export async function dispatchSettleOutcomes(
  input: DispatchSettleOutcomesInput
): Promise<{ needsLegacyDeskFloor: boolean }> {
  const enabled = input.bindings.filter((binding) => binding.enabled);
  const deliveries =
    input.deliveries === undefined
      ? createRoutineOutcomeDeliveryStoreFromEnv()
      : input.deliveries;
  const existing = deliveries
    ? await deliveries.listForRun({
        runId: input.envelope.run_id,
        tenantId: input.routine.tenant_id,
      })
    : [];

  const sent = new Set(
    existing.filter((row) => row.status === "sent").map((row) => row.outcome_id)
  );

  const always = enabled.filter((binding) => binding.mode === "always");
  for (const binding of always) {
    if (sent.has(binding.id)) {
      continue;
    }
    const result = await deliverOutcome({
      binding,
      envelope: input.envelope,
      idempotencyKey: SETTLE_IDEMPOTENCY_KEY,
      requestId: input.requestId,
      routine: input.routine,
      ...(input.artifacts === undefined ? {} : { artifacts: input.artifacts }),
      ...(deliveries ? { deliveries } : { deliveries: null }),
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      ...(input.handlers ? { handlers: input.handlers } : {}),
      ...(input.invoke ? { invoke: input.invoke } : {}),
      ...(input.moduleLoader ? { moduleLoader: input.moduleLoader } : {}),
      ...(input.threadStore === undefined
        ? {}
        : { threadStore: input.threadStore }),
      ...(input.workflowRuns === undefined
        ? {}
        : { workflowRuns: input.workflowRuns }),
    });
    if (result.ok) {
      sent.add(binding.id);
    }
  }

  if (!needsFailureFloor(input.envelope)) {
    return { needsLegacyDeskFloor: false };
  }
  const high = enabled.find(
    (binding) => binding.provider_id === NOTIFICATION_HIGH_PROVIDER_ID
  );
  if (!high) {
    return { needsLegacyDeskFloor: true };
  }
  if (sent.has(high.id)) {
    return { needsLegacyDeskFloor: false };
  }
  await deliverOutcome({
    binding: high,
    envelope: input.envelope,
    idempotencyKey: FAILURE_FLOOR_IDEMPOTENCY_KEY,
    requestId: input.requestId,
    routine: input.routine,
    ...(input.artifacts === undefined ? {} : { artifacts: input.artifacts }),
    ...(deliveries ? { deliveries } : { deliveries: null }),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.handlers ? { handlers: input.handlers } : {}),
    ...(input.invoke ? { invoke: input.invoke } : {}),
    ...(input.moduleLoader ? { moduleLoader: input.moduleLoader } : {}),
    ...(input.threadStore === undefined
      ? {}
      : { threadStore: input.threadStore }),
    ...(input.workflowRuns === undefined
      ? {}
      : { workflowRuns: input.workflowRuns }),
  });
  return { needsLegacyDeskFloor: false };
}
