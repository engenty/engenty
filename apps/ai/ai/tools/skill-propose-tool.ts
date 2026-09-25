// skill_propose (memory Phase 4b): an agent distills a workflow it has now
// performed successfully more than once into a draft SKILL.md. The draft
// lands in the PROPOSED area (never the discovered managed/custom tiers), an
// approver is notified, and only human approval promotes it into the custom
// tier where skill discovery sees it. The /skills mount and the managed tier
// stay read-only throughout — that safety property is untouched.

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getEngentyCoreBaseUrlFromEnv } from "../../src/ai/core-http-client.js";
import { executionSpaceId } from "../../src/ai/sessions/execution-lane.js";
import { createSkillProposalStore } from "../../src/ai/skills/skill-proposals.js";
import { createEngentyCoreFileStorageClient } from "../../src/ai/workspace/core-file-storage-client.js";
import { emitInboxNotification } from "../../src/notifications/inbox.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";

export const SKILL_PROPOSE_TOOL_ID = "skill_propose";

/** The subject of a `skill_proposed` row; its id is the proposal's name. */
export const SKILL_PROPOSAL_SUBJECT = "skill_proposal";

const SKILLS_CATALOG_ROUTE = "/admin/engenty/skills";

export const skillProposeTool = createTool({
  id: SKILL_PROPOSE_TOOL_ID,
  description:
    "Propose a reusable skill (SKILL.md) distilled from a workflow you have " +
    "now performed successfully more than once. A human reviews and enables " +
    "it before it becomes discoverable. Include: when to use it, the steps, " +
    "and the gotchas you hit.",
  inputSchema: z.object({
    name: z
      .string()
      .regex(/^[a-z0-9-]{3,50}$/)
      .describe("kebab-case skill name, e.g. 'invoice-dunning-flow'"),
    description: z
      .string()
      .min(10)
      .max(300)
      .describe("one-line 'use when …' trigger description"),
    body_md: z
      .string()
      .min(50)
      .max(8000)
      .describe("the SKILL.md body: when to use, steps, gotchas"),
  }),
  execute: async (input) => {
    const ctx = getEngentyToolsRunContext();
    const coreBaseUrl = ctx.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
    const accessToken = ctx.accessToken?.trim();
    const tenantId = ctx.tenantId ?? undefined;
    if (!(coreBaseUrl && accessToken && tenantId)) {
      return {
        ok: false as const,
        code: "unauthorized",
        message:
          "skill_propose is unavailable in this run (no core access token).",
      };
    }
    try {
      const store = createSkillProposalStore({
        storage: createEngentyCoreFileStorageClient({
          coreBaseUrl,
          accessToken,
        }),
        tenantId,
      });
      const proposedBy = ctx.agentTypeKey ?? ctx.agentId ?? null;
      const proposal = await store.put({
        body: input.body_md,
        description: input.description,
        name: input.name,
        proposedBy,
      });
      await emitInboxNotification({
        actor: { id: proposedBy, kind: proposedBy ? "agent" : "system" },
        body: input.description,
        dedupeKey: `skill-proposal:${tenantId}:${input.name}`,
        spaceId: executionSpaceId(ctx.space) ?? null,
        kind: "skill_proposed",
        metadata: {
          skill_name: input.name,
          ...(proposedBy
            ? { agent_id: proposedBy, agent_type_key: proposedBy }
            : {}),
        },
        priority: "medium",
        source: "memory",
        // Approve / reject (skills-routes) resolve by this subject.
        subject: { id: proposal.name, type: SKILL_PROPOSAL_SUBJECT },
        // No page decides a skill proposal yet; the skills catalog is where
        // the approved skill lands.
        target: SKILLS_CATALOG_ROUTE,
        tenantId,
        title: { key: "skill_proposed", params: { name: input.name } },
      });
      return {
        ok: true as const,
        name: proposal.name,
        status: "proposed",
        note: "The skill awaits human review; it is not discoverable until approved.",
      };
    } catch (err) {
      return {
        ok: false as const,
        code: "skill_propose_failed",
        message: err instanceof Error ? err.message : "skill_propose failed",
      };
    }
  },
});

export function createSkillProposeTools() {
  return { [SKILL_PROPOSE_TOOL_ID]: skillProposeTool };
}
