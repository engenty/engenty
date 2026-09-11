// agent_propose: the agent-side writer of the agent registry. Allow-listed
// NEW hires with a known space go live (create + mount). Anything wider —
// extra tools, skills, revisions, missing space — stays a proposal. Interactive
// runs then suspend with an Approve/Reject widget; headless runs inbox it.

import { resolveAgentEngenty, resolveChatModelId } from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getEngentyCoreBaseUrlFromEnv } from "../../src/ai/core-http-client.js";
import { invalidateRunSpaceSurface } from "../../src/ai/sessions/run-space.js";
import { emitInboxNotification } from "../../src/notifications/inbox.js";
import { releaseFrontendToolSuspendSlot } from "../frontend-tools/frontend-tool-suspend-lock.js";
import { isLiveHireEligible, withCatalogFloor } from "./agent-hire-policy.js";
import {
  createAndMountAgent,
  finalizeHireResume,
  type HireConfigBody,
  hireDecisionArtifact,
  hireSuspendLockKey,
  lookupExistingActive,
  proposeAgentRecord,
  suspendHireDecision,
} from "./agent-propose-hire.js";
import {
  addMountedAgentToRunSpace,
  resolveEngentyToolsRunContext,
} from "./engenty-tools/lib/run-context.js";
import {
  type NativeRequestDecisionResumeData,
  requestDecisionResumeSchema,
} from "./request-decision/native-request-decision.js";

export const AGENT_PROPOSE_TOOL_ID = "agent_propose";

const inputSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/,
      "agent id must look like '<domain>.<role>', e.g. 'sales.researcher'"
    )
    .describe(
      "Agent id in '<domain>.<role>' form (e.g. 'sales.researcher'). " +
        "Reusing an existing id proposes a revision to that agent."
    ),
  name: z.string().min(1).max(80).describe("Short display name"),
  // Required, and deliberately not inferable: it decides whether the hire
  // needs a routine to be finished (recurring work) or is complete on its
  // own (a specialist people talk to, or one that works assigned tasks).
  for_work: z
    .enum(["routine", "tasks", "chat"])
    .describe(
      "What this agent is being hired for. `routine` = recurring work, which " +
        "ALSO needs a routines_create call afterwards; this tool does not " +
        "create it. `tasks` = you will assign Tasks. `chat` = live questions."
    ),
  agent_scope: z
    .enum(["personal", "shared"])
    .default("shared")
    .describe(
      "Ownership: personal belongs to one user; shared is a company agent scoped to its active space"
    ),
  description: z
    .string()
    .min(1)
    .max(500)
    .describe("One-paragraph summary of the agent's mandate"),
  instructions: z
    .string()
    .min(40)
    .describe(
      "WHO the agent is and how it always works: mandate, tone, standing " +
        "constraints. Do NOT put a specific job's procedure here — that " +
        "belongs on the routine or action that runs it. A sentence true on " +
        "every run of the agent belongs here; a sentence true only for one " +
        "job does not.\n\nEvery specialist has a sandbox computer with a " +
        "shell (`mastra_workspace_execute_command`), supplied by its " +
        "workspace — it is NOT a tool id and is not in the catalog, so never " +
        "search for it and never list it in tool_ids. The container is lazy: " +
        "an agent that never runs a command never costs one. If the agent " +
        "needs a fact the model cannot know — the current time, a " +
        "calculation, the shape of a file — write the command into these " +
        "instructions (e.g. run `date` and read the hour from it) and say " +
        "what to do when it is unavailable. An agent told to reason about " +
        '"now" with no command to read it will guess.'
    ),
  model: z
    .string()
    .optional()
    .describe("Model id override; omit for the tenant default"),
  tool_ids: z
    .array(z.string().min(1))
    .default([])
    .describe(
      "Tool ids the agent should have (keep minimal). Files and the sandbox " +
        "shell arrive with the workspace and must not be listed here."
    ),
  skill_ids: z
    .array(z.string().min(1))
    .default([])
    .describe("Skill ids the agent should load"),
});

function configBody(
  input: z.infer<typeof inputSchema>,
  proposedBy: string | null,
  spaceId: string | null
): HireConfigBody {
  return {
    agentScope: input.agent_scope,
    name: input.name,
    description: input.description,
    engenty: resolveAgentEngenty(input.id),
    instructions: input.instructions,
    model:
      input.model ?? resolveChatModelId({ override: null, purpose: "chat" }),
    // Floored, not replaced: an approved proposal must be able to act.
    // Eligibility below still reads the REQUESTED ids, so the go-live gate
    // is unchanged — naming extra tools still routes through a human.
    toolIds: withCatalogFloor(input.tool_ids),
    skillIds: input.skill_ids,
    proposed_by_agent: proposedBy,
    proposed_space_id: spaceId,
  };
}

export const agentProposeTool = createTool({
  id: AGENT_PROPOSE_TOOL_ID,
  description:
    "Create or propose a specialist agent. A NEW hire with only the " +
    "catalog and Space Data write tools, no extra skills, and a known space " +
    "goes live immediately so you can message it. Extra tools, extra skills, revisions, " +
    "or a missing space stay a proposal: in this conversation a hire widget " +
    "waits for Approve/Reject; otherwise it lands in the coordinator desk " +
    "waiting lane. Use registry_agents_list first. Write instructions as a " +
    "clear standing mandate; keep tool/skill lists minimal. Every specialist " +
    "already gets a sandbox computer — say so in the instructions when the " +
    "job needs one; do not go looking for a shell tool id.",
  inputSchema,
  resumeSchema: requestDecisionResumeSchema,
  execute: async (input, ctx) => {
    const run = resolveEngentyToolsRunContext(ctx);
    const baseUrl = (
      run.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv()
    )?.replace(/\/$/, "");
    const accessToken = run.accessToken?.trim();
    if (!accessToken) {
      return {
        ok: false as const,
        code: "unauthorized",
        message:
          "agent_propose is unavailable in this run (no core access token).",
      };
    }
    if (!baseUrl) {
      return {
        ok: false as const,
        code: "service_unavailable",
        message:
          "agent_propose is unavailable because ENGENTY_CORE_BASE_URL is not configured.",
      };
    }
    const http = {
      accessToken,
      baseUrl,
      fetchFn: run.fetchImpl ?? fetch,
    };
    const lockKey = hireSuspendLockKey(run);
    const spaceId = run.space?.spaceId ?? null;
    const resume = ctx.agent?.resumeData as
      | NativeRequestDecisionResumeData
      | undefined;
    // The surface every gate in THIS run reads was resolved at run start —
    // a mount landing mid-run must be written back into it, and the cached
    // surface dropped so the next run resolves fresh.
    const noteLiveMount = () => {
      if (spaceId) {
        invalidateRunSpaceSurface(spaceId);
        addMountedAgentToRunSpace(run.space, input.id);
      }
    };
    if (resume) {
      releaseFrontendToolSuspendSlot(lockKey);
      const outcome = await finalizeHireResume({
        agentId: input.id,
        forWork: input.for_work,
        http,
        resume,
        spaceId,
      });
      if (outcome.ok && outcome.status === "active") {
        noteLiveMount();
      }
      return outcome;
    }
    try {
      const existing = await lookupExistingActive(http, input.id);
      if ("error" in existing) {
        return existing.error;
      }
      const proposedBy = run.agentTypeKey ?? run.agentId ?? null;
      const body = configBody(input, proposedBy, spaceId);
      if (
        isLiveHireEligible({
          existingActive: existing.existingActive,
          skillIds: input.skill_ids,
          spaceId,
          // The REQUESTED ids, not the floored set: the gate is about the
          // extras a human should see before this goes live.
          toolIds: input.tool_ids,
        })
      ) {
        const outcome = await createAndMountAgent(
          http,
          input.id,
          body,
          spaceId as string,
          input.for_work
        );
        if (outcome.ok && outcome.status === "active") {
          noteLiveMount();
        }
        if (outcome.ok && outcome.status === "active" && run.tenantId) {
          // No card was shown for this hire; the person still gets to know.
          await emitInboxNotification({
            actor: { id: proposedBy, kind: proposedBy ? "agent" : "system" },
            kind: "agent_hired",
            metadata: {
              agent_id: input.id,
              agent_name: input.name,
              ...(proposedBy ? { hired_by: proposedBy } : {}),
              tool_ids: input.tool_ids,
            },
            priority: "low",
            source: "agents",
            spaceId,
            subject: { id: input.id, type: "agent" },
            summary: `${proposedBy ?? "An agent"} hired ${input.name}${
              input.tool_ids.length > 0
                ? ` with ${input.tool_ids.join(", ")}`
                : " (no tools)"
            }`,
            tenantId: run.tenantId,
            ...(run.userId ? { userId: run.userId } : {}),
          });
        }
        return outcome;
      }
      const proposed = await proposeAgentRecord(http, input.id, body);
      if (!proposed.ok) {
        return proposed;
      }
      if (run.canSuspendForInteraction && ctx.agent?.suspend) {
        await suspendHireDecision({
          artifact: hireDecisionArtifact({
            description: input.description,
            id: input.id,
            instructions: input.instructions,
            name: input.name,
            skillIds: input.skill_ids,
            spaceId,
            // The REQUESTED ids, not the floored set: the gate is about the
            // extras a human should see before this goes live.
            toolIds: input.tool_ids,
          }),
          lockKey,
          suspend: ctx.agent.suspend,
        });
        return undefined as never;
      }
      if (run.tenantId) {
        await emitInboxNotification({
          dedupeKey: `agent-proposal:${run.tenantId}:${input.id}`,
          kind: "agent_proposed",
          metadata: {
            agent_id: input.id,
            ...(proposedBy ? { agent_type_key: proposedBy } : {}),
            ...(spaceId ? { space_id: spaceId } : {}),
          },
          priority: "medium",
          source: "agent-registry",
          summary: proposed.pending_revision
            ? `${proposedBy ?? "An agent"} proposed a revision to agent "${input.id}" — review and approve to apply it.`
            : `${proposedBy ?? "An agent"} proposed a new agent "${input.id}" — review and approve to activate it.`,
          tenantId: run.tenantId,
        });
      }
      return {
        ...proposed,
        note: proposed.pending_revision
          ? "A revision to this active agent is pending — a human must approve it before it takes effect."
          : "The agent is proposed — wait for the hire widget in this conversation, or the coordinator desk waiting lane, before assigning tasks.",
      };
    } catch (err) {
      return {
        ok: false as const,
        code: "agent_propose_failed",
        message: err instanceof Error ? err.message : "agent_propose failed",
      };
    }
  },
});

export function createAgentProposeTools() {
  return { [AGENT_PROPOSE_TOOL_ID]: agentProposeTool };
}
