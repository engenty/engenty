// The visibility resolver — the UP direction of the containment hierarchy
// (thread < task < routine < project < space < global). Given the work a
// run is bound to, returns the ordered workspace-prefix chain it may see,
// most-specific-first: routine? → task → project? → space? → global.
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
  projectId?: string | null;
  /** The `ai.routines` row whose fire started this run, when one did. */
  routineId?: string | null;
  /** Space the work sits in; filled from the task/project row when absent. */
  spaceId?: string | null;
  /** Task uuid — used to look up the project link when not supplied. */
  taskId?: string | null;
  /** Task workspace prefixes are keyed by IDENTIFIER (`ENG-1`), not uuid. */
  taskIdentifier?: string | null;
}

export interface ResolvedWorkVisibility {
  /** The chain as tiers+ids, most-specific-first — for mounts and logging. */
  chain: Array<{ id?: string; tier: WorkContainerTier }>;
  /** Ordered, most-specific-first. Always ends with the global commons prefix. */
  prefixes: string[];
  /** The one space the chain resolved to, or null when none could be proven. */
  spaceId: string | null;
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
 * binding are filled from the containment edges (task → project_id/space_id,
 * project → space_id) via module ops; a failed lookup contributes nothing
 * rather than throwing — visibility degrades to the tiers we could prove, and
 * the global commons tier is always present.
 *
 * A chain resolves to exactly ONE space. When the rows disagree — a task whose
 * project sits in a different space than the task row names — the most
 * specific row wins and the conflict is logged. That state is meant to be
 * unreachable (the composite `(space_id, tenant_id)` FKs plus the rule that a
 * containment tree lives in one space), so a log line here is a data-integrity
 * bug, not a case to design around. What must never happen is a chain that
 * silently spans two spaces: that would hand a run file prefixes from a space
 * it was never activated in.
 */
export async function resolveWorkVisibility(
  deps: {
    invoke: ModuleOpInvoker;
    /** Injected so tests can assert conflict logging; defaults to console.warn. */
    log?: (message: string, data?: Record<string, unknown>) => void;
    /**
     * Space to fall back to when no row proves one — normally the tenant's
     * default. `null` drops the space-rooted tiers rather than emitting
     * pre-space tenant-rooted paths that nothing reads.
     */
    spaceId: string | null;
    tenantId: string;
  },
  binding: WorkVisibilityBinding
): Promise<ResolvedWorkVisibility> {
  const { invoke, tenantId } = deps;
  const log = deps.log ?? ((message, data) => console.warn(message, data));

  let projectId = str(binding.projectId);
  const taskId = str(binding.taskId);
  const taskIdentifier = str(binding.taskIdentifier);
  const routineId = str(binding.routineId);

  // Space candidates in precedence order, most specific first, each tagged with
  // its source so a disagreement can be reported usefully.
  const spaceCandidates: Array<{ id: string; source: string }> = [];
  const pushSpace = (id: string | null, source: string): void => {
    if (id) {
      spaceCandidates.push({ id, source });
    }
  };
  pushSpace(str(binding.spaceId), "binding");

  // Fill missing links from the task row when we can.
  if (taskId && !(projectId && spaceCandidates.length > 0)) {
    const task = (await invoke("tasks_get", { id: taskId }).catch(
      () => null
    )) as {
      project_id?: unknown;
      space_id?: unknown;
    } | null;
    projectId ||= str(task?.project_id);
    pushSpace(str(task?.space_id), "task");
  }
  // The project is the last row that can name a space.
  if (projectId && spaceCandidates.length === 0) {
    const project = (await invoke("projects_get", { id: projectId }).catch(
      () => null
    )) as { space_id?: unknown } | null;
    pushSpace(str(project?.space_id), "project");
  }

  if (new Set(spaceCandidates.map((c) => c.id)).size > 1) {
    log("resolveWorkVisibility: containment chain spans multiple spaces", {
      candidates: spaceCandidates,
      chosen: spaceCandidates[0]?.id,
      task_id: taskId,
      tenant_id: tenantId,
    });
  }
  const spaceId = spaceCandidates[0]?.id ?? deps.spaceId;

  const chain: Array<{ id?: string; tier: WorkContainerTier }> = [];
  if (routineId) {
    chain.push({ id: routineId, tier: "routine" });
  }
  if (taskIdentifier) {
    chain.push({ id: taskIdentifier, tier: "task" });
  }
  if (projectId) {
    chain.push({ id: projectId, tier: "project" });
  }
  // The space's own commons sits between the project and the tenant commons —
  // shared by everything in the space, invisible to every other space.
  if (spaceId) {
    chain.push({ id: spaceId, tier: "space" });
  }
  chain.push({ tier: "global" });

  return {
    chain,
    prefixes: chain.flatMap((node) => {
      if (node.tier === "global") {
        return [workWorkspacePrefix(tenantId, null, "global")];
      }
      // Without a space there is no path for this tier — contribute nothing
      // rather than a prefix pointing outside the containment boundary.
      return spaceId
        ? [workWorkspacePrefix(tenantId, spaceId, node.tier, node.id)]
        : [];
    }),
    spaceId: spaceId ?? null,
  };
}
