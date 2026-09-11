// The container resolver — the DOWN direction of the containment hierarchy.
// Walks the containment edges DOWN from a container (thread < task <
// routine < project < space < global) to the artifact scopes, workspace
// prefixes, tasks, and threads it holds; the artifact/file routes call this
// so "what's inside X" has a single answer. The UP direction — "what can this
// run see" — is resolve-work-visibility.ts (consumed by the task-job
// specialist step and the Mastra workspace mount table). Both directions live
// in this module so containment logic has exactly one home.
import {
  type WorkContainerTier,
  workWorkspacePrefix,
} from "@engenty/file-storage";

import { createRoutineStoreFromEnv } from "../index.js";

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
  /**
   * Agent ids mounted on a space. Visiting `space:<id>` adds an `agent`
   * artifact scope per id so artifacts kept with those Engenties stay in
   * the space's "in this space" listing. Tests omit this; the container
   * still resolves projects, tasks, and the space's own scope.
   */
  listSpaceAgentIds?: (spaceId: string) => Promise<string[]>;
  /** Injected so tests can assert cap logging; defaults to console.warn. */
  log?: (message: string, data?: Record<string, unknown>) => void;
  /**
   * Space the container lives in — the root of every non-global workspace
   * prefix (PLAN-spaces.md). `null` omits those prefixes; the container's
   * artifacts, tasks and threads still resolve.
   */
  spaceId: string | null;
  tenantId: string;
}

/** Page size hard cap for task/project lists — log when hit (no silent truncation). */
const LIST_PAGE_SIZE = 200;
/** Runs (→ threads) per task are bounded; a task rarely has more than a few. */
const MAX_RUNS_PER_TASK = 50;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Rows out of a list operation, accepting BOTH shapes the gateway returns.
 *
 * The declared output schema is `{ data, total, page, pageSize }`, but
 * `/api/tools/<op>/invoke` hands back the rows as a bare array once the `{ok,
 * data}` envelope is unwrapped. Reading only `.data` silently produced an empty
 * list for every live routine/project walk while the unit tests — whose
 * fake invoker returned the documented wrapper — stayed green. Accept both, and
 * keep a test on each.
 */
function readList(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result as Record<string, unknown>[];
  }
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
  const { invoke, spaceId, tenantId } = deps;
  const log = deps.log ?? ((message, data) => console.warn(message, data));

  const visited = new Set<string>();
  const artifactScopeKeys = new Set<string>();
  const artifactScopes: Array<{ scope_type: string; scope_id: string }> = [];
  const taskIds = new Set<string>();
  const threadIds = new Set<string>();
  const workspacePrefixes = new Set<string>();

  /**
   * Space-rooted prefixes only exist when the space is known. The space in
   * force is CARRIED DOWN the walk: everything inside `space:<id>` is in that
   * space by definition, so resolving a space container must not depend on the
   * ambient `deps.spaceId` (which is only a fallback for containers reached
   * without one). `null` omits the prefix rather than rooting it wrongly.
   */
  function addWorkspacePrefix(
    tier: "task" | "routine" | "project" | "space",
    id: string,
    space: string | null
  ): void {
    if (space) {
      workspacePrefixes.add(workWorkspacePrefix(tenantId, space, tier, id));
    }
  }

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

  async function visitTask(
    taskId: string,
    space: string | null
  ): Promise<void> {
    addArtifactScope("task", taskId);
    taskIds.add(taskId);
    // The task's own workspace prefix is keyed by IDENTIFIER when available
    // (existing prefixes are keyed that way); fall back to the id.
    const task = (await invoke("tasks_get", { id: taskId }).catch(
      () => null
    )) as { identifier?: unknown; space_id?: unknown } | null;
    const identifier = str(task?.identifier) || taskId;
    const taskSpace = str(task?.space_id) || space;
    addWorkspacePrefix("task", identifier, taskSpace);
    // Threads of the task's runs (task_runs → ai.agent_run.thread_id).
    const runs = readList(
      await invoke("tasks_list_runs", { id: taskId }).catch(() => null)
    );
    for (const run of runs.slice(0, MAX_RUNS_PER_TASK)) {
      const threadId = str(run.agent_thread_id);
      if (threadId) {
        await visit({ tier: "thread", id: threadId }, space);
      }
    }
  }

  async function visit(
    node: WorkContainerRef,
    space: string | null
  ): Promise<void> {
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
        await visitTask(node.id, space);
        return;
      }
      case "routine": {
        // A routine holds no tasks — its fires produce runs, not work items —
        // so the durable workspace it carries across runs is the whole of what
        // it contains. No `routine` artifact scope value exists either.
        //
        // The row is read for its space: the prefix must be rooted where the
        // routine actually lives, not in whatever space the walk arrived from.
        // A routine that is not there contributes nothing, exactly as a missing
        // node did before.
        const routine = await createRoutineStoreFromEnv()
          ?.get({ id: node.id, tenantId })
          .catch(() => null);
        if (!routine) {
          return;
        }
        addWorkspacePrefix("routine", node.id, routine.space_id ?? space);
        return;
      }
      case "project": {
        addArtifactScope("project", node.id);
        addWorkspacePrefix("project", node.id, space);
        const tasks = readList(
          await invoke("tasks_list", {
            project_id: node.id,
            pageSize: LIST_PAGE_SIZE,
          }).catch(() => null)
        );
        warnIfCapped("tasks_list{project_id}", tasks.length, node.id);
        for (const task of tasks) {
          await visit({ tier: "task", id: str(task.id) }, space);
        }
        // Phases are NOT resolved here (LINKED decision).
        return;
      }
      case "space": {
        // The widest container below Global: its own commons folder, its
        // space-scoped artifacts, and everything the space holds. Projects are
        // visited first so their tasks dedupe through `visited`; the direct
        // task list then picks up space work with no project.
        addArtifactScope("space", node.id);
        addWorkspacePrefix("space", node.id, node.id);
        const projects = readList(
          await invoke("projects_list", {
            space_id: node.id,
            pageSize: LIST_PAGE_SIZE,
          }).catch(() => null)
        );
        warnIfCapped("projects_list{space_id}", projects.length, node.id);
        for (const project of projects) {
          await visit({ tier: "project", id: str(project.id) }, node.id);
        }
        const tasks = readList(
          await invoke("tasks_list", {
            space_id: node.id,
            pageSize: LIST_PAGE_SIZE,
          }).catch(() => null)
        );
        warnIfCapped("tasks_list{space_id}", tasks.length, node.id);
        for (const task of tasks) {
          await visit({ tier: "task", id: str(task.id) }, node.id);
        }
        const agentIds = deps.listSpaceAgentIds
          ? await deps.listSpaceAgentIds(node.id).catch(() => [])
          : [];
        for (const agentId of agentIds) {
          const id = str(agentId);
          if (id) {
            addArtifactScope("agent", id);
          }
        }
        return;
      }
      case "global": {
        // Caller lists all artifacts by tenant; only the commons prefix here.
        workspacePrefixes.add(workWorkspacePrefix(tenantId, null, "global"));
        return;
      }
      default: {
        return;
      }
    }
  }

  await visit(ref, spaceId);

  return {
    artifactScopes,
    taskIds: [...taskIds],
    threadIds: [...threadIds],
    workspacePrefixes: [...workspacePrefixes],
  };
}
