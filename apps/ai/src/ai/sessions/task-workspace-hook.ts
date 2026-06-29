// Task binding + checkout side-effects for the harness:
//   1. Resolve the task binding from the session (route_context + workspace_key).
//   2. Call `tasks_checkout` to claim the run (writes the FK on tasks).
//   3. Patch the session with canonical task fields.
// Assembling the Mastra Workspace itself is the declaration-driven hook's job
// (see agent-workspace-hook.ts); this module no longer builds workspaces.

import {
  EngentyCoreClient,
  EngentyCoreHttpError,
  getEngentyCoreBaseUrlFromEnv,
} from "../core-http-client.js";
import { AiSessionError } from "../errors.js";
import type { AiSessionScope } from "./types.js";

// Workspace-key contract shared with the tasks module (`task:<IDENTIFIER>`).
// Inlined here so the AI harness has no build-time dependency on @engenty/tasks —
// the actual task operations are invoked over HTTP by operationId (`tasks_checkout`).
const TASK_IDENTIFIER_PATTERN = /^[A-Z0-9]+-\d+$/;

function taskWorkspaceKey(identifier: string): string {
  const trimmed = identifier.trim();
  if (!TASK_IDENTIFIER_PATTERN.test(trimmed)) {
    throw new Error("task_identifier_invalid");
  }
  return `task:${trimmed}`;
}

export type TaskRouteContext = Record<string, unknown>;

export interface TaskWorkspaceBinding {
  identifier: string;
  taskId: string;
  workspaceKey: string;
}

export type ModuleOperationInvoker = (
  operationId: string,
  input?: unknown
) => Promise<unknown | null>;

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRouteScope(routeContext: TaskRouteContext): TaskRouteContext {
  const scope = routeContext.scope;
  if (scope && typeof scope === "object" && !Array.isArray(scope)) {
    return scope as TaskRouteContext;
  }
  return {};
}

export function extractTaskRouteFields(routeContext: TaskRouteContext): {
  identifier?: string;
  taskId?: string;
} {
  const scope = readRouteScope(routeContext);
  const taskId =
    readString(scope.task_id) ??
    readString(scope.entity_id) ??
    readString(scope.entityId) ??
    readString(routeContext.task_id) ??
    readString(routeContext.entity_id) ??
    readString(routeContext.entityId);
  const identifier =
    readString(scope.task_identifier) ??
    readString(routeContext.task_identifier);
  return { identifier, taskId };
}

export function resolveTaskBinding(input: {
  routeContext: TaskRouteContext;
  workspaceKey?: string | null;
}): TaskWorkspaceBinding | null {
  const { identifier, taskId } = extractTaskRouteFields(input.routeContext);
  if (!(taskId && identifier)) {
    return null;
  }
  const workspaceKey = input.workspaceKey ?? taskWorkspaceKey(identifier);
  return { identifier, taskId, workspaceKey };
}

export function createScopeModuleOperationInvoker(
  scope: AiSessionScope
): ModuleOperationInvoker {
  return async (operationId, input) => {
    const userAccessToken = scope.userAccessToken?.trim();
    const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
    if (!(userAccessToken && coreBaseUrl)) {
      throw new Error(
        "Task workspace preparation requires core-backed tools with an end-user bearer token."
      );
    }
    const client = new EngentyCoreClient({
      coreBaseUrl,
      userAccessToken,
    });
    return client.invokeTool(operationId, input ?? {});
  };
}

async function resolveTaskIdentifier(
  invokeOperation: ModuleOperationInvoker,
  taskId: string
): Promise<string | null> {
  try {
    const result = (await invokeOperation("tasks_get", { id: taskId })) as {
      identifier?: unknown;
    } | null;
    return readString(result?.identifier) ?? null;
  } catch {
    return null;
  }
}

function isTaskCheckoutConflict(error: unknown): boolean {
  if (error instanceof EngentyCoreHttpError) {
    return (
      error.status === 409 ||
      error.code === "task_checkout_conflict" ||
      error.message === "task_checkout_conflict"
    );
  }
  if (error instanceof Error) {
    return error.message === "task_checkout_conflict";
  }
  return false;
}

// Claims the task for this run and patches the session with canonical task
// fields. Returns the resolved binding (the harness uses `binding.identifier`
// to mount `/task`). No workspace is built here.
export async function prepareTaskWorkspaceForRun(input: {
  agentId: string;
  invokeOperation: ModuleOperationInvoker;
  routeContext: TaskRouteContext;
  runId: string;
  scope: AiSessionScope;
  threadId: string;
  updateSession: (patch: {
    routeContext: TaskRouteContext;
    workspaceKey: string;
  }) => Promise<void>;
  workspaceKey: string | null;
}): Promise<{
  binding: TaskWorkspaceBinding | null;
}> {
  let binding = resolveTaskBinding({
    routeContext: input.routeContext,
    workspaceKey: input.workspaceKey,
  });

  if (!binding) {
    const { taskId } = extractTaskRouteFields(input.routeContext);
    if (!taskId) {
      return { binding: null };
    }
    const identifier = await resolveTaskIdentifier(
      input.invokeOperation,
      taskId
    );
    if (!identifier) {
      return { binding: null };
    }
    binding = {
      identifier,
      taskId,
      workspaceKey: input.workspaceKey ?? taskWorkspaceKey(identifier),
    };
  }

  if (input.workspaceKey && input.workspaceKey !== binding.workspaceKey) {
    throw new AiSessionError(
      "agent_threads.taskCheckoutConflict",
      "Session workspace_key does not match task binding",
      {
        expected_workspace_key: binding.workspaceKey,
        session_workspace_key: input.workspaceKey,
        task_id: binding.taskId,
      }
    );
  }

  try {
    await input.invokeOperation("tasks_checkout", {
      agent_run_id: input.runId,
      agent_id: input.agentId,
      id: binding.taskId,
    });
  } catch (error) {
    if (isTaskCheckoutConflict(error)) {
      throw new AiSessionError(
        "agent_threads.taskCheckoutConflict",
        "Task checkout conflict",
        {
          task_id: binding.taskId,
          ...(error instanceof EngentyCoreHttpError
            ? { details: error.details, status: error.status }
            : {}),
        }
      );
    }
    throw error;
  }

  const scope = readRouteScope(input.routeContext);
  const routeContext: TaskRouteContext = {
    ...input.routeContext,
    scope: {
      ...scope,
      current_module: readString(scope.current_module) ?? "tasks",
      entity_id: binding.taskId,
      task_id: binding.taskId,
      task_identifier: binding.identifier,
    },
    task_id: binding.taskId,
    task_identifier: binding.identifier,
  };

  await input.updateSession({
    routeContext,
    workspaceKey: binding.workspaceKey,
  });

  return { binding };
}
