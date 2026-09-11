// One event, every routine that listens for it.
//
// Two doors lead here: module events arrive over HTTP from core's plugin bus
// (`POST /ai/v1/routines/events`), this process's own record events arrive
// over the in-process bus (`infra/app-events.ts`). Matching and firing live
// here so the two doors cannot drift.
//
// Each matching ROUTINE gets its OWN run — an event never fans out into child
// work items, and two matching triggers of the same routine still mean one run.
import { createLogger } from "@engenty/telemetry";
import type { RoutineStore } from "../../dal/routines/routine-store.js";
import type {
  RoutineTriggerRow,
  RoutineTriggerStore,
} from "../../dal/routines/routine-trigger-store.js";
import type { WorkflowRunStore } from "../../dal/workflow-runs/workflow-run-store.js";
import type { WorkflowStore } from "../../dal/workflows/workflow-store.js";
import { onAppEvent } from "../../infra/app-events.js";
import { eventFilterMatches, mapEventInput } from "./event-input.js";
import { fireRoutine } from "./fire-routine.js";

const logger = createLogger({ name: "routine-events" });

export const MODULE_EVENTS_PROVIDER_ID = "module-events";

export interface RoutineEventStores {
  flowGraphs: WorkflowStore;
  requests: WorkflowRunStore;
  routines: RoutineStore;
  triggers: RoutineTriggerStore;
}

export interface RoutineEventFire {
  error?: true;
  routine_id: string;
  run_id: string | null;
}

export interface DispatchRoutineEventResult {
  fired: RoutineEventFire[];
  matched: number;
}

export async function dispatchRoutineEvent(input: {
  payload: Record<string, unknown>;
  resource: string;
  stores: RoutineEventStores;
  tenantId: string;
}): Promise<DispatchRoutineEventResult> {
  const { stores } = input;
  const candidates = await stores.triggers.list({
    enabled: true,
    kind: "event",
    tenantId: input.tenantId,
  });
  const matchingByRoutine = new Map<string, RoutineTriggerRow>();
  for (const trigger of candidates) {
    if (
      trigger.provider_id === MODULE_EVENTS_PROVIDER_ID &&
      trigger.resource === input.resource &&
      eventFilterMatches(trigger.event_filter, input.payload) &&
      !matchingByRoutine.has(trigger.routine_id)
    ) {
      matchingByRoutine.set(trigger.routine_id, trigger);
    }
  }

  const fired = await Promise.all(
    [...matchingByRoutine.values()].map(
      async (trigger): Promise<RoutineEventFire> => {
        try {
          const routine = await stores.routines.get({
            id: trigger.routine_id,
            tenantId: input.tenantId,
          });
          if (!routine) {
            return { routine_id: trigger.routine_id, run_id: null };
          }
          const result = await fireRoutine({
            eventInput: mapEventInput(trigger.input_mapping, input.payload),
            flowGraphs: stores.flowGraphs,
            honorQuietHours: true,
            requests: stores.requests,
            routine,
            routines: stores.routines,
            trigger: "hook",
          });
          return { routine_id: routine.id, run_id: result.runId ?? null };
        } catch (err) {
          // One misconfigured routine must not deny the others their run.
          logger.error("event routine fire failed", {
            message: err instanceof Error ? err.message : String(err),
            routineId: trigger.routine_id,
          });
          return { error: true, routine_id: trigger.routine_id, run_id: null };
        }
      }
    )
  );
  return { fired, matched: matchingByRoutine.size };
}

/**
 * Wire the in-process bus to the dispatcher. Stores resolve per event so a
 * process that boots without a database still starts, and simply matches
 * nothing until one appears.
 */
export function startRoutineEventListener(
  stores: () => RoutineEventStores | null
): () => void {
  return onAppEvent(async (event) => {
    const resolved = stores();
    if (!resolved) {
      return;
    }
    const result = await dispatchRoutineEvent({
      payload: event.payload,
      resource: event.resource,
      stores: resolved,
      tenantId: event.tenantId,
    });
    if (result.matched > 0) {
      logger.info("app event fired routines", {
        matched: result.matched,
        resource: event.resource,
      });
    }
  });
}
