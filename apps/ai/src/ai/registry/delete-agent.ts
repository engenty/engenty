// Deleting a registry agent, and everything that only existed for it. One
// function for both writers: the registry HTTP route (a person on the desk)
// and `agent_remove` (a coordinator or the copilot, after a person approved
// the card). Not undoable — the row, its routines and its own workflows go.
import { createLogger } from "@engenty/telemetry";
import type { RegistryStore } from "../../dal/registry/index.js";
import type { EngentyCoreClient } from "../core-http-client.js";
import {
  createRoutineStoreFromEnv,
  createWorkflowStoreFromEnv,
} from "../index.js";
import { listPublishedWorkflowsRunningAgent } from "../workflows/graph-agents.js";

const logger = createLogger({ name: "apps/ai/delete-agent" });

export interface NamedRef {
  id: string;
  name: string;
}

export type DeleteRegistryAgentResult =
  | { deleted: boolean; ok: true }
  | { ok: false; reason: "referenced_by_workflows"; workflows: NamedRef[] };

/**
 * What a delete takes with it, for the card a person approves: the agent's
 * routines and the workflows it owns. Both come from the same stores the
 * delete clears, so the card lists exactly what goes.
 */
export async function listAgentDeletionFootprint(input: {
  agentId: string;
  tenantId: string;
}): Promise<{ routines: NamedRef[]; workflows: NamedRef[] }> {
  const routineStore = createRoutineStoreFromEnv();
  const workflowStore = createWorkflowStoreFromEnv();
  const [routines, graphs] = await Promise.all([
    routineStore
      ? routineStore.list({ agentId: input.agentId, tenantId: input.tenantId })
      : [],
    workflowStore ? workflowStore.list({ tenantId: input.tenantId }) : [],
  ]);
  return {
    routines: routines.map((routine) => ({
      id: routine.id,
      name: routine.name,
    })),
    workflows: graphs
      .filter((graph) => graph.owner_agent_id === input.agentId)
      .map((graph) => ({ id: graph.id, name: graph.name })),
  };
}

/**
 * The routines an unmount from `spaceId` pauses: core's agent-unmount cascade
 * (`DELETE /api/spaces/:id/mounts/agent/:key`) disables the agent's enabled
 * routines in that Space — this lists the same set for the card.
 */
export async function listAgentRoutinesInSpace(input: {
  agentId: string;
  spaceId: string;
  tenantId: string;
}): Promise<NamedRef[]> {
  const routineStore = createRoutineStoreFromEnv();
  if (!routineStore) {
    return [];
  }
  const routines = await routineStore.list({
    agentId: input.agentId,
    enabled: true,
    spaceId: input.spaceId,
    tenantId: input.tenantId,
  });
  return routines.map((routine) => ({ id: routine.id, name: routine.name }));
}

/** The Spaces (visible to this caller) that mount the agent. */
export async function listSpacesMountingAgent(
  core: Pick<EngentyCoreClient, "listSpaceMounts" | "listSpaces">,
  agentId: string
): Promise<NamedRef[]> {
  const spaces = await core.listSpaces();
  const mounted = await Promise.all(
    spaces.map(async (space) => {
      const mounts = await core.listSpaceMounts(space.id).catch(() => []);
      return mounts.some(
        (mount) =>
          mount.resourceType === "agent" && mount.resourceKey === agentId
      )
        ? { id: space.id, name: space.name }
        : null;
    })
  );
  return mounted.filter((space): space is NamedRef => space !== null);
}

/**
 * Delete the agent's row, its Space mounts, its routines and its own
 * workflows.
 *
 * Referential guard: a published Workflow that runs this agent keeps running
 * after the row is gone — its next invocation fails with unknownAgentType at
 * 03:00, which is the worst place to learn about a deletion. Deleting past
 * the guard is a stated choice (`force`), never a surprise. Live-hit
 * 2026-08-28: an orphaned "Monthly Bookkeeping Intake" outlived its deleted
 * specialist and failed on the next invoke. The agent's OWN workflows are
 * exempt — they are deleted with it below, so they never outlive it.
 */
export async function deleteRegistryAgent(
  input: { agentId: string; force?: boolean; tenantId: string },
  deps: {
    core: Pick<EngentyCoreClient, "deleteSpaceMount" | "listSpaces"> | null;
    store: Pick<RegistryStore, "deleteAgent">;
  }
): Promise<DeleteRegistryAgentResult> {
  const { agentId, tenantId } = input;
  if (!input.force) {
    const referencing = await listPublishedWorkflowsRunningAgent({
      agentId,
      excludeOwnedBy: agentId,
      tenantId,
    });
    if (referencing.length > 0) {
      return {
        ok: false,
        reason: "referenced_by_workflows",
        workflows: referencing,
      };
    }
  }
  const deleted = await deps.store.deleteAgent(tenantId, agentId);
  if (!deleted) {
    return { deleted, ok: true };
  }
  // The row is gone; nothing may keep pointing at it. Mount rows and trigger
  // bindings are cleaned server-side — best-effort per space, because a mount
  // that outlives its agent is inert (it names a resource that no longer
  // resolves) while a failed delete here would resurrect nothing.
  const { core } = deps;
  if (core) {
    try {
      const spaces = await core.listSpaces();
      await Promise.allSettled(
        spaces.map((space) => core.deleteSpaceMount(space.id, "agent", agentId))
      );
    } catch (err) {
      // Unreachable core: the mounts stay until the next cleanup.
      logger.warn("agent mount cleanup failed", { agentId, err });
    }
  }
  // A routine whose specialist no longer exists can never run again —
  // DELETED with the agent, not paused (pausing is the unmount case, where
  // re-mounting brings a working setup back). Before the graphs: a routine
  // row RESTRICTs the workflow it binds.
  const routines = createRoutineStoreFromEnv();
  if (routines) {
    try {
      const owned = await routines.list({ agentId, tenantId });
      await Promise.allSettled(
        owned.map((routine) => routines.delete({ id: routine.id, tenantId }))
      );
    } catch (err) {
      // The scheduler sweep disables unresolvable owners as backstop.
      logger.warn("agent routine cleanup failed", { agentId, err });
    }
  }
  // The agent's own workflows go with it. Run history pins a version
  // (workflow_run RESTRICTs), and a foreign routine may still bind a graph —
  // those rows are disabled instead of removed, so the audit trail survives
  // and nothing can fire them.
  const flowGraphs = createWorkflowStoreFromEnv();
  if (flowGraphs) {
    try {
      const graphs = await flowGraphs.list({ tenantId });
      await Promise.allSettled(
        graphs
          .filter((graph) => graph.owner_agent_id === agentId)
          .map(async (graph) => {
            try {
              await flowGraphs.remove({ id: graph.id, tenantId });
            } catch {
              await flowGraphs.setStatus({
                id: graph.id,
                status: "disabled",
                tenantId,
              });
            }
          })
      );
    } catch (err) {
      // Unreachable storage: disabled owners cannot fire regardless —
      // dispatch resolves the agent and refuses an unknown one.
      logger.warn("agent workflow cleanup failed", { agentId, err });
    }
  }
  return { deleted, ok: true };
}
