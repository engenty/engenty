import type { StorageService } from "@engenty/plugin-sdk";
import type { createTasksRepoSupabase } from "../dal/supabase.js";
import type { Task, TaskCheckoutInput } from "../schema/types.js";
import { ensureTaskWorkspacePrefix } from "./ensure-task-workspace-prefix.js";

type TasksRepo = ReturnType<typeof createTasksRepoSupabase>;

export async function performTaskCheckout(
  deps: {
    repo: TasksRepo;
    storage: StorageService | null | undefined;
    tenantId: string;
  },
  taskId: string,
  input: TaskCheckoutInput,
  opts?: { actorUserId?: string | null }
): Promise<Task> {
  const task = await deps.repo.checkoutTask(taskId, input, opts);

  if (!(deps.tenantId && deps.storage)) {
    return task;
  }

  try {
    await ensureTaskWorkspacePrefix(
      deps.storage,
      deps.tenantId,
      task.identifier
    );
  } catch {
    // Checkout succeeds even when prefix bootstrap fails; harness can retry ensure.
  }

  return task;
}
