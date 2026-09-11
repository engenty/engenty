import type { StorageService } from "@engenty/plugin-sdk";
import type { createTasksRepoSupabase } from "../dal/supabase.js";
import type { Task, TaskCheckoutInput } from "../schema/types.js";
import { ensureTaskWorkspacePrefix } from "./ensure-task-workspace-prefix.js";

type TasksRepo = ReturnType<typeof createTasksRepoSupabase>;

export async function performTaskCheckout(
  deps: {
    repo: TasksRepo;
    /** Space the checked-out work belongs to — its storage prefix root. */
    spaceId: string | null | undefined;
    storage: StorageService | null | undefined;
    tenantId: string;
  },
  taskId: string,
  input: TaskCheckoutInput,
  opts?: { actorUserId?: string | null }
): Promise<Task> {
  const task = await deps.repo.checkoutTask(taskId, input, opts);

  // Task-row Space, then the validated auth/default Space passed in by the
  // plugin (auth Space when Space-bound, tenant default only for a true
  // global/legacy run). No space means no place to put the bytes: skip the
  // bootstrap rather than writing them back to the pre-space tenant root.
  const spaceId =
    (typeof task.space_id === "string" && task.space_id.trim()
      ? task.space_id.trim()
      : undefined) ??
    deps.spaceId ??
    null;
  if (!(deps.tenantId && spaceId && deps.storage)) {
    return task;
  }

  try {
    await ensureTaskWorkspacePrefix(
      deps.storage,
      deps.tenantId,
      spaceId,
      task.identifier
    );
  } catch {
    // Checkout succeeds even when prefix bootstrap fails; harness can retry ensure.
  }

  return task;
}
