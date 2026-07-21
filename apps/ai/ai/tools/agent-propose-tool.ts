// agent_propose: the agent-side writer of the agent registry. Lets planner
// agents (coordinator) CREATE new specialist agents or EVOLVE existing ones —
// always as a proposal a human must approve. A new agent lands
// status='proposed' (never assembled/runnable); a revision to an active agent
// parks in proposed_config while the agent keeps running its approved config.
// The approve/reject routes are deliberately NOT exposed as tools.

import { resolveChatModelId } from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { emitInboxNotification } from "../../src/notifications/inbox.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";

export const AGENT_PROPOSE_TOOL_ID = "agent_propose";

interface ProposeResponse {
  error?: string;
  record?: {
    status?: string;
    proposed_config?: Record<string, unknown> | null;
  };
}

export const agentProposeTool = createTool({
  id: AGENT_PROPOSE_TOOL_ID,
  description:
    "Propose a NEW specialist agent, or a revision to an existing one, for " +
    "human approval. Nothing goes live from this call: new agents stay " +
    "status='proposed' and revisions park until a human approves them. Use " +
    "registry_agents_list first to check existing agent ids. Write " +
    "instructions as a clear standing mandate (role, responsibilities, " +
    "boundaries); keep tool/skill lists minimal — a human can widen them " +
    "later.",
  inputSchema: z.object({
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
    description: z
      .string()
      .min(1)
      .max(500)
      .describe("One-paragraph summary of the agent's mandate"),
    instructions: z
      .string()
      .min(40)
      .describe(
        "The agent's standing instructions: mandate, responsibilities, " +
          "boundaries, and how it should work"
      ),
    model: z
      .string()
      .optional()
      .describe("Model id override; omit for the tenant default"),
    tool_ids: z
      .array(z.string().min(1))
      .default([])
      .describe("Tool ids the agent should have (keep minimal)"),
    skill_ids: z
      .array(z.string().min(1))
      .default([])
      .describe("Skill ids the agent should load"),
  }),
  execute: async (input) => {
    const ctx = getEngentyToolsRunContext();
    const baseUrl = ctx.coreBaseUrl?.replace(/\/$/, "");
    const userAccessToken = ctx.userAccessToken?.trim();
    if (!(baseUrl && userAccessToken)) {
      return {
        ok: false as const,
        code: "unauthorized",
        message:
          "agent_propose is unavailable in this run (no core access token).",
      };
    }
    try {
      const proposedBy = ctx.agentTypeKey ?? ctx.agentId ?? null;
      const body = {
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        model:
          input.model ??
          resolveChatModelId({ override: null, purpose: "chat" }),
        toolIds: input.tool_ids,
        skillIds: input.skill_ids,
        proposed_by_agent: proposedBy,
      };
      const response = await fetch(
        `${baseUrl}/ai/registry/agents/${encodeURIComponent(input.id)}/propose`,
        {
          body: JSON.stringify(body),
          headers: {
            accept: "application/json",
            authorization: `Bearer ${userAccessToken}`,
            "content-type": "application/json",
          },
          method: "POST",
        }
      );
      const data = (await response.json().catch(() => ({}))) as ProposeResponse;
      if (!response.ok) {
        return {
          ok: false as const,
          code: "agent_propose_failed",
          message: `agent_propose: HTTP ${response.status}${
            data.error ? ` (${data.error})` : ""
          }`,
        };
      }
      const pendingRevision = Boolean(data.record?.proposed_config);
      if (ctx.tenantId) {
        await emitInboxNotification({
          dedupeKey: `agent-proposal:${ctx.tenantId}:${input.id}`,
          kind: "agent_proposed",
          metadata: {
            agent_id: input.id,
            ...(proposedBy ? { agent_type_key: proposedBy } : {}),
          },
          priority: "medium",
          source: "agent-registry",
          summary: pendingRevision
            ? `${proposedBy ?? "An agent"} proposed a revision to agent "${input.id}" — review and approve to apply it.`
            : `${proposedBy ?? "An agent"} proposed a new agent "${input.id}" — review and approve to activate it.`,
          tenantId: ctx.tenantId,
        });
      }
      return {
        ok: true as const,
        agent_id: input.id,
        status: data.record?.status ?? "proposed",
        pending_revision: pendingRevision,
        note: pendingRevision
          ? "A revision to this active agent is pending — a human must approve it before it takes effect."
          : "The agent is proposed — a human must approve it before it can run or be assigned tasks.",
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
