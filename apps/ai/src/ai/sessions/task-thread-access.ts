// Who may read a headless run's transcript.
//
// Every other thread in the system is somebody's chat, and the ownership check
// in session-service is the whole boundary (the AI service connects with the
// service-role key, so RLS never runs). A dispatched TASK run breaks that
// model: it is created by the service principal, so `created_by_user_id` is
// null and `null !== callerUserId` locked EVERYONE out — including the person
// looking at the task. The run history card opened onto an empty box.
//
// A task run's transcript is not a private chat. It is the work record of a
// task, so the right rule is: whoever may read the TASK may read its runs. We
// do not re-derive that permission here — we ask core with the CALLER's own
// credential and let the task's existing read gate answer. A caller who cannot
// see the task gets the same 404 as before.
import { createScopeModuleOperationInvoker } from "./task-workspace-hook.js";
import type { AiSessionScope } from "./types.js";

/** The subset of a thread row this decision needs. */
export interface TaskThreadShape {
  created_by_user_id: string | null;
  route_context: Record<string, unknown>;
}

/**
 * The task a headless run belongs to, or null if this is not one.
 *
 * Both conditions matter. `created_by_user_id === null` means no human owns
 * this thread, so there is no private chat to leak; `route_context.task_id` is
 * what `registerTaskJobRun` stamps. A thread with an owner stays owner-only
 * even if something put a task id on it.
 */
export function taskIdOfRunThread(session: TaskThreadShape): string | null {
  if (session.created_by_user_id !== null) {
    return null;
  }
  const taskId = session.route_context?.task_id;
  return typeof taskId === "string" && taskId.trim() ? taskId : null;
}

/**
 * The routine a run belongs to, or null if this is not one.
 *
 * Same two conditions and the same reason as the task case above: nobody typed
 * a routine fire, so the thread has no owner, and `route_context.routine_id` is
 * what the dispatcher stamps. Before routines produced runs, a routine's
 * transcript rode a task thread and inherited that rule for free; now it needs
 * its own.
 */
export function routineIdOfRunThread(session: TaskThreadShape): string | null {
  if (session.created_by_user_id !== null) {
    return null;
  }
  const routineId = session.route_context?.routine_id;
  return typeof routineId === "string" && routineId.trim() ? routineId : null;
}

/**
 * The published Workflow a run belongs to, or null if this is not one.
 *
 * Same two conditions as above. A pressed Workflow is unattended execution the
 * same way a routine tick is — the presser starts the run, the service
 * principal performs it — so `registerActionRun` stamps
 * `route_context.workflow_id` on every graph-run thread and leaves it unowned.
 */
export function workflowIdOfRunThread(session: TaskThreadShape): string | null {
  if (session.created_by_user_id !== null) {
    return null;
  }
  const workflowId = session.route_context?.workflow_id;
  return typeof workflowId === "string" && workflowId.trim()
    ? workflowId
    : null;
}

/**
 * May this caller read this TASK? Asked of core with the caller's own
 * credential, so the task's existing read gate is the only rule — nothing is
 * re-derived here.
 *
 * Never throws: any failure (core down, task deleted, no permission) is a
 * plain `false`, which the caller turns into the same not-found it would have
 * raised anyway.
 */
export async function canReadTask(input: {
  scope: AiSessionScope;
  taskId: string;
}): Promise<boolean> {
  try {
    const invoke = createScopeModuleOperationInvoker(input.scope);
    const task = await invoke("tasks_get", { id: input.taskId });
    return Boolean(task);
  } catch {
    return false;
  }
}

/**
 * May this caller read this thread, given they are not its owner?
 */
export async function canReadTaskRunThread(input: {
  scope: AiSessionScope;
  session: TaskThreadShape;
}): Promise<boolean> {
  const taskId = taskIdOfRunThread(input.session);
  if (!taskId) {
    return false;
  }
  return canReadTask({ scope: input.scope, taskId });
}
