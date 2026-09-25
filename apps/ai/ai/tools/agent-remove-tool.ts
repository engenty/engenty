// agent_remove: the counterpart of agent_propose, in two shapes.
//
// - A custom specialist (hired, a registry row) is DELETED — its row, its
//   mounts, its routines and the workflows it owns — through the same
//   function as the registry DELETE route. Not undoable.
// - A module agent (shipped by a module's code) is only REMOVED from this
//   Space, through core's agent-unmount cascade — the same call the desk's
//   "Remove from Space" makes: its routines here are paused, its open tasks
//   here unassigned, the mount goes. The agent stays and can be added back.
//
// Either way a person ALWAYS approves it on a card, whatever the Space's
// approval mode; a run that cannot park refuses.
//
// Who may call it (caller-scope.ts): the copilot and a coordinator — the ones
// that may hire into the Space. A specialist may not remove a colleague or
// itself; that is management work. The copilot, coordinators and other
// interfaces are never removable here.

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../../src/ai/core-http-client.js";
import { createRegistryStoreFromEnv } from "../../src/ai/index.js";
import {
  deleteRegistryAgent,
  listAgentDeletionFootprint,
  listAgentRoutinesInSpace,
  listSpacesMountingAgent,
} from "../../src/ai/registry/delete-agent.js";
import { invalidateRunSpaceSurface } from "../../src/ai/sessions/run-space.js";
import { listPublishedWorkflowsRunningAgent } from "../../src/ai/workflows/graph-agents.js";
import type { RegistryStore } from "../../src/dal/registry/index.js";
import { releaseFrontendToolSuspendSlot } from "../frontend-tools/frontend-tool-suspend-lock.js";
import {
  hireSuspendLockKey,
  readDecisionChoice,
  suspendHireDecision,
} from "./agent-propose-hire.js";
import {
  type AgentRemoveMode,
  agentDeleteDecisionArtifact,
  agentUnmountDecisionArtifact,
} from "./agent-remove-card.js";
import {
  callerScope,
  coordinatorIdsForRun,
} from "./engenty-tools/lib/caller-scope.js";
import { resolveRegistryAgent } from "./engenty-tools/lib/registry-agent.js";
import {
  removeMountedAgentFromRunSpace,
  resolveEngentyToolsRunContext,
} from "./engenty-tools/lib/run-context.js";
import {
  isGlobalConnectorGate,
  isUnresolvedSpaceGate,
} from "./engenty-tools/lib/space-gate.js";
import {
  type NativeRequestDecisionResumeData,
  requestDecisionResumeSchema,
} from "./request-decision/native-request-decision.js";

export const AGENT_REMOVE_TOOL_ID = "agent_remove";

const COPILOT_AGENT_ID = "engenty.copilot";

type RemoveCore = Pick<
  EngentyCoreClient,
  "deleteSpaceMount" | "listSpaceMounts" | "listSpaces"
>;

export interface AgentRemoveToolDeps {
  /** Core as the run's caller — mount listing, unmount and cleanup. */
  core?: (input: {
    accessToken: string;
    coreBaseUrl: string;
    fetchImpl?: typeof fetch;
  }) => RemoveCore;
  registry?: () => Pick<RegistryStore, "deleteAgent"> | null;
  /** The composite registry (hired rows AND module/builtin agents). */
  resolveAgent?: typeof resolveRegistryAgent;
}

const inputSchema = z.object({
  agent_id: z
    .string()
    .min(1)
    .describe(
      "Id of the agent to remove, exactly as registry_agents_list returns it."
    ),
});

function refused(code: string, message: string) {
  return { ok: false as const, code, message };
}

function defaultCore(input: {
  accessToken: string;
  coreBaseUrl: string;
  fetchImpl?: typeof fetch;
}): RemoveCore {
  return new EngentyCoreClient(input);
}

/** Custom (hired) specialists are deleted; module ones leave this Space. */
function removeModeFor(agent: {
  kind?: string;
  source?: string;
}): AgentRemoveMode | null {
  if ((agent.kind ?? "specialist") !== "specialist") {
    return null;
  }
  if (agent.source === "database") {
    return "delete";
  }
  return agent.source === "module" ? "unmount" : null;
}

export function createAgentRemoveTool(deps: AgentRemoveToolDeps = {}) {
  const registry = deps.registry ?? createRegistryStoreFromEnv;
  const coreFor = deps.core ?? defaultCore;
  const resolveAgent = deps.resolveAgent ?? resolveRegistryAgent;
  return createTool({
    id: AGENT_REMOVE_TOOL_ID,
    description:
      "Remove an agent mounted in this Space. A custom (hired) specialist is " +
      "DELETED with its routines and the workflows it owns — not undoable. " +
      "A module agent is only removed from this Space (its routines here " +
      "paused) and can be added back. Always shows the person a card to " +
      "approve first; from a run nobody can answer, it refuses. The copilot, " +
      "coordinators and you yourself cannot be removed. Use " +
      "registry_agents_list for the id.",
    inputSchema,
    resumeSchema: requestDecisionResumeSchema,
    execute: async (input, ctx) => {
      const run = resolveEngentyToolsRunContext(ctx);
      const agentId = input.agent_id.trim();
      const scope = callerScope();
      if (scope.kind === "specialist") {
        const coordinators = coordinatorIdsForRun();
        return refused(
          "agent_remove_forbidden",
          `Removing an agent is management work. ${
            coordinators.length > 0
              ? `Ask a coordinator (${coordinators.join(", ")}) with message_agent.`
              : "Say so in your reply, so a person can remove it."
          }`
        );
      }
      if (agentId === run.agentTypeKey?.trim()) {
        return refused(
          "agent_remove_self",
          "You cannot remove yourself. Only a person can remove you."
        );
      }
      if (agentId === COPILOT_AGENT_ID) {
        return refused(
          "agent_remove_interface",
          "The copilot is the Space's interface and cannot be removed."
        );
      }
      const space =
        run.space &&
        !isUnresolvedSpaceGate(run.space) &&
        !isGlobalConnectorGate(run.space)
          ? run.space
          : null;
      if (!space) {
        return refused(
          "agent_remove_no_space",
          "agent_remove works inside a Space. Ask from the Space the agent is mounted in."
        );
      }
      if (!(space.agentIds?.has(agentId) ?? false)) {
        return refused(
          "agent_remove_not_mounted",
          `'${agentId}' is not mounted in this Space. Use registry_agents_list for the agents here.`
        );
      }
      if (space.topLevelAgentIds?.has(agentId)) {
        return refused(
          "agent_remove_coordinator",
          `'${agentId}' is a coordinator of this Space and cannot be removed with agent_remove. Only a person can remove it.`
        );
      }
      const tenantId = run.tenantId?.trim();
      const accessToken = run.accessToken?.trim();
      const coreBaseUrl = (
        run.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv()
      )?.replace(/\/$/, "");
      const store = registry();
      if (!(tenantId && accessToken && coreBaseUrl && store)) {
        return refused(
          "service_unavailable",
          "agent_remove is unavailable in this run (no tenant, core access or registry)."
        );
      }
      const agent = await resolveAgent(agentId);
      if (agent === undefined) {
        return refused(
          "service_unavailable",
          "The agent registry is unreachable; nothing was removed. Try again."
        );
      }
      const mode = agent ? removeModeFor(agent) : null;
      if (!(agent && mode)) {
        return refused(
          "agent_remove_not_removable",
          `'${agentId}' is not a specialist that can be removed here.`
        );
      }
      const name = agent.name ?? agentId;
      const core = coreFor({
        accessToken,
        coreBaseUrl,
        ...(run.fetchImpl ? { fetchImpl: run.fetchImpl } : {}),
      });
      // The surface every gate in THIS run reads was resolved at run start —
      // drop the agent from it, and the cached surface with it.
      const noteRemoved = () => {
        invalidateRunSpaceSurface(space.spaceId);
        removeMountedAgentFromRunSpace(run.space, agentId);
      };
      const lockKey = hireSuspendLockKey(run);
      const resume = ctx.agent?.resumeData as
        | NativeRequestDecisionResumeData
        | undefined;
      if (resume) {
        releaseFrontendToolSuspendSlot(lockKey);
        if (readDecisionChoice(resume) !== "approve") {
          return {
            ok: true as const,
            agent_id: agentId,
            status: "declined" as const,
            note: `The user did not approve. ${name} was not removed; nothing changed.`,
          };
        }
        if (mode === "unmount") {
          try {
            // Core's cascade: routines here paused, open tasks unassigned,
            // mount gone — exactly what the desk's "Remove from Space" does.
            await core.deleteSpaceMount(space.spaceId, "agent", agentId);
          } catch (err) {
            return refused(
              "agent_remove_failed",
              `${name} was not removed from this Space: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
          noteRemoved();
          return {
            ok: true as const,
            agent_id: agentId,
            status: "unmounted" as const,
            note: `${name} was removed from this Space; its routines here are paused. It can be added back.`,
          };
        }
        const result = await deleteRegistryAgent(
          { agentId, tenantId },
          { core, store }
        );
        if (!result.ok) {
          return refused(
            "agent_remove_referenced",
            `Not deleted: published workflows owned by others still run ${agentId}: ${result.workflows
              .map((entry) => entry.name)
              .join(", ")}. Retarget or delete them first.`
          );
        }
        noteRemoved();
        return {
          ok: true as const,
          agent_id: agentId,
          status: "deleted" as const,
          note: `${name} was deleted with its routines and its own workflows.`,
        };
      }
      if (!(run.canSuspendForInteraction && ctx.agent?.suspend)) {
        return refused(
          "agent_remove_needs_person",
          `'${agentId}' was not removed: removing an agent always needs a person to approve, and this run has nobody to ask. Ask for it from a chat where someone can approve the card.`
        );
      }
      if (mode === "unmount") {
        const routines = await listAgentRoutinesInSpace({
          agentId,
          spaceId: space.spaceId,
          tenantId,
        });
        await suspendHireDecision({
          artifact: agentUnmountDecisionArtifact({ agentId, name, routines }),
          lockKey,
          suspend: ctx.agent.suspend,
        });
        return undefined as never;
      }
      const referencing = await listPublishedWorkflowsRunningAgent({
        agentId,
        excludeOwnedBy: agentId,
        tenantId,
      });
      if (referencing.length > 0) {
        return refused(
          "agent_remove_referenced",
          `'${agentId}' was not deleted: published workflows owned by others still run it: ${referencing
            .map((entry) => entry.name)
            .join(", ")}. Retarget or delete them first.`
        );
      }
      const [footprint, spaces] = await Promise.all([
        listAgentDeletionFootprint({ agentId, tenantId }),
        listSpacesMountingAgent(core, agentId),
      ]);
      await suspendHireDecision({
        artifact: agentDeleteDecisionArtifact({
          agentId,
          name,
          routines: footprint.routines,
          spaces,
          workflows: footprint.workflows,
        }),
        lockKey,
        suspend: ctx.agent.suspend,
      });
      return undefined as never;
    },
  });
}

export function createAgentRemoveTools(deps: AgentRemoveToolDeps = {}) {
  return { [AGENT_REMOVE_TOOL_ID]: createAgentRemoveTool(deps) };
}
