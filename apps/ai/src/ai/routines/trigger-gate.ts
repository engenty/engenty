// The fire door: is this workflow open to THIS kind of caller?
//
// "Everything is a routine" — a workflow is run through a routine, and the
// routine's trigger rows say who may start it: `agent` opens it to
// invoke_workflow, `manual` to a person's press. Turning a trigger off actually
// closes that door; without any routine at all the workflow is not runnable
// from outside (publish creates the wrapper, so this is the unwrapped-draft
// case).
import {
  createRoutineStoreFromEnv,
  createRoutineTriggerStoreFromEnv,
} from "../index.js";

export interface FireGateResult {
  allowed: boolean;
  /** Why not — worded for the caller (agent or route) to relay. */
  reason?: string;
  /** The enabled routine whose trigger opened the door. */
  routineId?: string;
}

export async function checkWorkflowFireGate(input: {
  kind: "agent" | "manual";
  tenantId: string;
  workflowId: string;
}): Promise<FireGateResult> {
  const routines = createRoutineStoreFromEnv();
  const triggers = createRoutineTriggerStoreFromEnv();
  if (!(routines && triggers)) {
    // Storage misconfiguration must not silently open the door.
    return { allowed: false, reason: "routine storage is not configured." };
  }
  const rows = await routines.list({ tenantId: input.tenantId });
  const bound = rows.filter(
    (routine) => routine.workflow_id === input.workflowId
  );
  if (bound.length === 0) {
    return {
      allowed: false,
      reason:
        "This Action has no routine yet, so nothing may fire it. Publishing it creates one.",
    };
  }
  const enabledRoutines = bound.filter((routine) => routine.enabled);
  if (enabledRoutines.length === 0) {
    return { allowed: false, reason: "Its routine is paused." };
  }
  const kindTriggers = await triggers.list({
    enabled: true,
    kind: input.kind,
    tenantId: input.tenantId,
  });
  const open = enabledRoutines.find((routine) =>
    kindTriggers.some((trigger) => trigger.routine_id === routine.id)
  );
  if (!open) {
    return {
      allowed: false,
      reason:
        input.kind === "agent"
          ? "Its routine has no enabled agent trigger — agents may not fire it. A person can turn that trigger on in the routine's triggers."
          : "Its routine has no enabled manual trigger — it cannot be pressed. Turn that trigger on in the routine's triggers.",
    };
  }
  return { allowed: true, routineId: open.id };
}
