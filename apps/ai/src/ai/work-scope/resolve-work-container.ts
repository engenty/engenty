// The container resolver — the DOWN direction of the containment hierarchy.
// Walks the containment edges DOWN from a container (thread < task <
// goal|routine < project < global) to the artifact scopes, workspace
// prefixes, tasks, and threads it holds; the artifact/file routes call this
// so "what's inside X" has a single answer. The UP direction — "what can this
// run see" — is resolve-work-visibility.ts (consumed by the task-job
// specialist step and the Mastra workspace mount table). Both directions live
// in this module so containment logic has exactly one home.
import {
  type WorkContainerTier,
  workWorkspacePrefix,
} from "@engenty/file-storage";

/** Invoke a module operation over HTTP (see task-workspace-hook.ts). */
export type ModuleOpInvoker = (
  operationId: string,
  input?: unknown
) => Promise<unknown | null>;

export interface WorkContainerRef {
  id: string;
  tier: WorkContainerTier | "thread";
}

export interface ResolvedWorkContainer {
  /** For the `ai.artifact` scope_type+scope_id IN-query. */
  artifactScopes: Array<{ scope_type: string; scope_id: string }>;
  taskIds: string[];
  threadIds: string[];
  workspacePrefixes: string[];
}

export interface ResolveWorkContainerDeps {
  invoke: ModuleOpInvoker;
  /** Injected so tests can assert cap logging; defaults to console.warn. */
  log?: (message: string, data?: Record<string, unknown>) => void;
  tenantId: string;
}

/** Page size hard cap for task/goal lists — log when hit (no silent truncation). */
const LIST_PAGE_SIZE = 200;
/** Runs (→ threads) per task are bounded; a task rarely has more than a few. */
const MAX_RUNS_PER_TASK = 50;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readList(result: unknown): Record<string, unknown>[] {
  const data = (result as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/**
 * Resolve a container ref to its contents. Memoized per request (a `${tier}:${id}`
 * visited set) so cyclic/duplicate edges resolve once. Never throws on a missing
 * op result — a null/absent list just contributes nothing.
 */
export async function resolveWorkContainer(
  deps: ResolveWorkContainerDeps,
  ref: WorkContainerRef
): Promise<ResolvedWorkContainer> {
  const { invoke, tenantId } = deps;
  const log = deps.log ?? ((message, data) => console.warn(message, data));

  const visited = new Set<string>();
  const artifactScopeKeys = new Set<string>();
  const artifactScopes: Array<{ scope_type: string; scope_id: string }> = [];
  const taskIds = new Set<string>();
  const threadIds = new Set<string>();
  const workspacePrefixes = new Set<string>();

  function addArtifactScope(scopeType: string, scopeId: string): void {
    const key = `${scopeType}:${scopeId}`;
    if (!artifactScopeKeys.has(key)) {
      artifactScopeKeys.add(key);
      artifactScopes.push({ scope_type: scopeType, scope_id: scopeId });
    }
  }

  function warnIfCapped(op: string, count: number, id: string): void {
    if (count >= LIST_PAGE_SIZE) {
      log("resolveWorkContainer list hit page cap — results truncated", {
        cap: LIST_PAGE_SIZE,
        container_id: id,
        op,
      });
    }
  }

  async function visitTask(taskId: string): Promise<void> {
    addArtifactScope("task", taskId);
    taskIds.add(taskId);
    // The task's own workspace prefix is keyed by IDENTIFIER when available
    // (existing prefixes are keyed that way); fall back to the id.
    const task = (await invoke("tasks_get", { id: taskId }).catch(
      () => null
    )) as { identifier?: unknown } | null;
    const identifier = str(task?.identifier) || taskId;
    workspacePrefixes.add(workWorkspacePrefix(tenantId, "task", identifier));
    // Threads of the task's runs (task_runs → ai.agent_run.thread_id).
    const runs = readList(
      await invoke("tasks_list_runs", { id: taskId }).catch(() => null)
    );
    for (const run of runs.slice(0, MAX_RUNS_PER_TASK)) {
      const threadId = str(run.agent_thread_id);
      if (threadId) {
        await visit({ tier: "thread", id: threadId });
      }
    }
  }

  async function visit(node: WorkContainerRef): Promise<void> {
    const key = `${node.tier}:${node.id}`;
    if (visited.has(key)) {
      return;
    }
    visited.add(key);

    switch (node.tier) {
      case "thread": {
        addArtifactScope("thread", node.id);
        threadIds.add(node.id);
        return;
      }
      case "task": {
        await visitTask(node.id);
        return;
      }
      case "goal": {
        addArtifactScope("goal", node.id);
        workspacePrefixes.add(workWorkspacePrefix(tenantId, "goal", node.id));
        const tasks = readList(
          await invoke("tasks_list", {
            goal_id: node.id,
            pageSize: LIST_PAGE_SIZE,
          }).catch(() => null)
        );
        warnIfCapped("tasks_list{goal_id}", tasks.length, node.id);
        for (const task of tasks) {
          await visit({ tier: "task", id: str(task.id) });
        }
        return;
      }
      case "routine": {
        // No `routine` artifact scope value exists — routine visibility rides
        // the thread→task→trigger edges; only the workspace prefix is its own.
        workspacePrefixes.add(
          workWorkspacePrefix(tenantId, "routine", node.id)
        );
        const tasks = readList(
          await invoke("tasks_list", {
            trigger_id: node.id,
            pageSize: LIST_PAGE_SIZE,
          }).catch(() => null)
        );
        warnIfCapped("tasks_list{trigger_id}", tasks.length, node.id);
        for (const task of tasks) {
          await visit({ tier: "task", id: str(task.id) });
        }
        return;
      }
      case "project": {
        addArtifactScope("project", node.id);
        workspacePrefixes.add(
          workWorkspacePrefix(tenantId, "project", node.id)
        );
        const goals = readList(
          await invoke("goals_list", {
            project_id: node.id,
            pageSize: LIST_PAGE_SIZE,
          }).catch(() => null)
        );
        warnIfCapped("goals_list{project_id}", goals.length, node.id);
        for (const goal of goals) {
          await visit({ tier: "goal", id: str(goal.id) });
        }
        const tasks = readList(
          await invoke("tasks_list", {
            project_id: node.id,
            pageSize: LIST_PAGE_SIZE,
          }).catch(() => null)
        );
        warnIfCapped("tasks_list{project_id}", tasks.length, node.id);
        for (const task of tasks) {
          await visit({ tier: "task", id: str(task.id) });
        }
        // Phases are NOT resolved here (LINKED decision).
        return;
      }
      case "global": {
        // Caller lists all artifacts by tenant; only the commons prefix here.
        workspacePrefixes.add(workWorkspacePrefix(tenantId, "global"));
        return;
      }
      default: {
        return;
      }
    }
  }

  await visit(ref);

  return {
    artifactScopes,
    taskIds: [...taskIds],
    threadIds: [...threadIds],
    workspacePrefixes: [...workspacePrefixes],
  };
}
