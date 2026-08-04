// The visibility resolver — the UP direction of the containment hierarchy
// (thread < task < goal|routine < project < global). Given the work a run is
// bound to, returns the ordered workspace-prefix chain it may see,
// most-specific-first: routine? → task → goal? → project? → global.
//
// resolve-work-container.ts walks DOWN (container → contents, for "what's
// inside X"); this walks UP (binding → enclosing containers, for "what can
// this run see"). Both directions live in this module so containment logic
// has exactly one home — consumers must not hand-roll either walk.
import {
  type WorkContainerTier,
  workWorkspacePrefix,
} from "@engenty/file-storage";

import type { ModuleOpInvoker } from "./resolve-work-container.js";

export interface WorkVisibilityBinding {
  goalId?: string | null;
  projectId?: string | null;
  /** Task uuid — used to look up goal/project links when not supplied. */
  taskId?: string | null;
  /** Task workspace prefixes are keyed by IDENTIFIER (`ENG-1`), not uuid. */
  taskIdentifier?: string | null;
  triggerId?: string | null;
}

export interface ResolvedWorkVisibility {
  /** The chain as tiers+ids, most-specific-first — for mounts and logging. */
  chain: Array<{ id?: string; tier: WorkContainerTier }>;
  /** Ordered, most-specific-first. Always ends with the global commons prefix. */
  prefixes: string[];
}

function str(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the upward chain for a run's work binding. Links absent from the
 * binding are filled from the containment edges (task → goal_id/project_id,
 * goal → project_id) via module ops; a failed lookup contributes nothing
 * rather than throwing — visibility degrades to the tiers we could prove,
 * and the global commons tier is always present.
 */
export async function resolveWorkVisibility(
  deps: { invoke: ModuleOpInvoker; tenantId: string },
  binding: WorkVisibilityBinding
): Promise<ResolvedWorkVisibility> {
  const { invoke, tenantId } = deps;

  let goalId = str(binding.goalId);
  let projectId = str(binding.projectId);
  const taskId = str(binding.taskId);
  const taskIdentifier = str(binding.taskIdentifier);
  const triggerId = str(binding.triggerId);

  // Fill missing links from the task row when we can.
  if (taskId && !(goalId && projectId)) {
    const task = (await invoke("tasks_get", { id: taskId }).catch(
      () => null
    )) as { goal_id?: unknown; project_id?: unknown } | null;
    goalId ||= str(task?.goal_id);
    projectId ||= str(task?.project_id);
  }
  // A goal can carry the project link the task lacks.
  if (goalId && !projectId) {
    const goal = (await invoke("goals_get", { id: goalId }).catch(
      () => null
    )) as { project_id?: unknown } | null;
    projectId = str(goal?.project_id);
  }

  const chain: Array<{ id?: string; tier: WorkContainerTier }> = [];
  if (triggerId) {
    chain.push({ id: triggerId, tier: "routine" });
  }
  if (taskIdentifier) {
    chain.push({ id: taskIdentifier, tier: "task" });
  }
  if (goalId) {
    chain.push({ id: goalId, tier: "goal" });
  }
  if (projectId) {
    chain.push({ id: projectId, tier: "project" });
  }
  chain.push({ tier: "global" });

  return {
    chain,
    prefixes: chain.map((node) =>
      node.tier === "global"
        ? workWorkspacePrefix(tenantId, "global")
        : workWorkspacePrefix(tenantId, node.tier, node.id)
    ),
  };
}
