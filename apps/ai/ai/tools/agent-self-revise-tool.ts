// `agent_self_revise` — a specialist proposing a change to its OWN standing
// instructions or mandate summary, from the chat where the change was asked for.
//
// The gap it closes: a run can already steer its own routine
// (`routine-self-tools`) and its own task (`task-self-tools`), but nothing let
// it touch its own registry row — so "from now on, don't name the tense before
// I answer" died as prose in a transcript. Registry writes stay a management
// act, which is why this never applies anything: it lands in
// `proposed_config` while the agent keeps running its approved config, and a
// human approves it on the card (or on the desk).
//
// Self-scoped by construction: the target is the run's OWN `agentTypeKey`,
// never an argument. An agent cannot rewrite a colleague.
import { createRequestDecisionArtifact } from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getEngentyCoreBaseUrlFromEnv } from "../../src/ai/core-http-client.js";
import { releaseFrontendToolSuspendSlot } from "../frontend-tools/frontend-tool-suspend-lock.js";
import {
  type HireHttp,
  hireSuspendLockKey,
  readDecisionChoice,
  registryJson,
  suspendHireDecision,
} from "./agent-propose-hire.js";
import { resolveEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import {
  type NativeRequestDecisionResumeData,
  requestDecisionResumeSchema,
} from "./request-decision/native-request-decision.js";

export const AGENT_SELF_REVISE_TOOL_ID = "agent_self_revise";

const inputSchema = z
  .object({
    description: z
      .string()
      .min(10)
      .max(2000)
      .optional()
      .describe(
        "Your new mandate summary — the short description shown on your desk " +
          "and in the roster. Omit to keep the current one."
      ),
    instructions: z
      .string()
      .min(40)
      .optional()
      .describe(
        "Your COMPLETE new standing instructions — the full text that replaces " +
          "the current one, not a diff and not the part that changed. Keep " +
          "everything that still applies. Omit to keep the current ones."
      ),
    summary: z
      .string()
      .min(1)
      .max(200)
      .describe(
        "One line for the person approving: what changes and why they asked for it."
      ),
  })
  .refine((value) => value.description || value.instructions, {
    message: "Pass new instructions, a new description, or both.",
  });

interface CurrentConfig {
  name?: string;
  source?: string;
}

function revisionArtifact(input: {
  agentId: string;
  description?: string;
  instructions?: string;
  name: string;
  summary: string;
}) {
  const sections = [
    input.summary,
    `${input.name} (${input.agentId}) keeps running its current instructions until this is approved.`,
    ...(input.description ? [`New description:\n\n${input.description}`] : []),
    ...(input.instructions
      ? [`New instructions:\n\n${input.instructions}`]
      : []),
  ];
  return {
    ...createRequestDecisionArtifact({
      title: `Change how ${input.name} works?`,
      body: sections.join("\n\n"),
      choices: [
        {
          id: "approve",
          label: "Approve",
          description: "Apply the new instructions from the next turn on.",
        },
        {
          id: "reject",
          label: "Reject",
          description:
            "Discard the change. The agent keeps working as it does.",
        },
      ],
    }),
    durable_inbox: true,
  };
}

export const agentSelfReviseTool = createTool({
  id: AGENT_SELF_REVISE_TOOL_ID,
  description:
    "Propose a change to YOUR OWN standing instructions or mandate summary — how " +
    "you always work, not what you do in this one reply. Use it when the user " +
    "tells you to work differently from now on, or when your job has moved. " +
    "Nothing changes until a person approves it: pass your complete new " +
    "instructions and/or a new description, then tell the user the change is " +
    "waiting for their approval and keep working as you do today.",
  inputSchema,
  resumeSchema: requestDecisionResumeSchema,
  execute: async (input, ctx) => {
    const run = resolveEngentyToolsRunContext(ctx);
    const agentId = run.agentTypeKey?.trim();
    const accessToken = run.accessToken?.trim();
    const baseUrl = (
      run.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv()
    )?.replace(/\/$/, "");
    if (!agentId) {
      return {
        ok: false as const,
        code: "unknown_agent",
        message:
          "This run does not know which registry agent it is, so it cannot revise itself.",
      };
    }
    if (!(accessToken && baseUrl)) {
      return {
        ok: false as const,
        code: "unauthorized",
        message: `${AGENT_SELF_REVISE_TOOL_ID} is unavailable in this run (no core access).`,
      };
    }
    const http: HireHttp = {
      accessToken,
      baseUrl,
      fetchFn: run.fetchImpl ?? fetch,
    };
    const lockKey = hireSuspendLockKey(run);

    const resume = ctx.agent?.resumeData as
      | NativeRequestDecisionResumeData
      | undefined;
    if (resume) {
      releaseFrontendToolSuspendSlot(lockKey);
      const choice = readDecisionChoice(resume);
      if (choice === "dismiss" || choice === "unknown") {
        return {
          ok: true as const,
          agent_id: agentId,
          status: "proposed" as const,
          note: "The change is still waiting for approval. Keep working as you do today, and do not offer to change again unless asked.",
        };
      }
      const decided = await registryJson(
        http,
        `/ai/registry/agents/${encodeURIComponent(agentId)}/${choice}`,
        { body: "{}", method: "POST" }
      );
      if (!decided.ok) {
        return {
          ok: false as const,
          code: "agent_self_revise_failed",
          message: `${AGENT_SELF_REVISE_TOOL_ID}: ${choice} HTTP ${decided.status}`,
        };
      }
      return {
        ok: true as const,
        agent_id: agentId,
        status:
          choice === "approve" ? ("active" as const) : ("rejected" as const),
        note:
          choice === "approve"
            ? "Approved. The new instructions apply from your next turn — this turn still runs the old ones."
            : "Rejected. Keep working exactly as you do today.",
      };
    }

    const current = await registryJson(
      http,
      `/ai/registry/agents/${encodeURIComponent(agentId)}`
    );
    if (!current.ok) {
      return {
        ok: false as const,
        code: "agent_self_revise_failed",
        message: `${AGENT_SELF_REVISE_TOOL_ID}: lookup HTTP ${current.status}`,
      };
    }
    const config = (current.data.agent ?? {}) as CurrentConfig &
      Record<string, unknown>;
    if (config.source !== "database") {
      // A module-shipped agent's instructions live in its files, where a
      // proposal has nothing to write back to.
      return {
        ok: false as const,
        code: "not_revisable",
        message:
          "Your instructions ship with the app you belong to, so they cannot be changed from here. Tell the user to raise it with whoever maintains that app.",
      };
    }

    // The WHOLE current config with one field changed. A proposal is applied
    // column by column (`approveAgent` spreads `proposed_config` over the
    // row), and every column is written from the body — so a partial body
    // would silently drop this agent's starters, sandbox, limits and skills
    // the moment a human approved the wording change.
    const proposed = await registryJson(
      http,
      `/ai/registry/agents/${encodeURIComponent(agentId)}/propose`,
      {
        body: JSON.stringify({
          ...config,
          id: agentId,
          ...(input.description ? { description: input.description } : {}),
          ...(input.instructions ? { instructions: input.instructions } : {}),
          proposed_by_agent: agentId,
          ...(run.space?.spaceId
            ? { proposed_space_id: run.space.spaceId }
            : {}),
        }),
        method: "POST",
      }
    );
    if (!proposed.ok) {
      return {
        ok: false as const,
        code: "agent_self_revise_failed",
        message: `${AGENT_SELF_REVISE_TOOL_ID}: propose HTTP ${proposed.status}`,
      };
    }
    if (run.canSuspendForInteraction && ctx.agent?.suspend) {
      await suspendHireDecision({
        artifact: revisionArtifact({
          agentId,
          ...(input.description ? { description: input.description } : {}),
          ...(input.instructions ? { instructions: input.instructions } : {}),
          name: config.name ?? agentId,
          summary: input.summary,
        }),
        lockKey,
        suspend: ctx.agent.suspend,
      });
      return undefined as never;
    }
    return {
      ok: true as const,
      agent_id: agentId,
      status: "proposed" as const,
      note: "The change is proposed and waiting for a person to approve it. Keep working as you do today, and say so plainly.",
    };
  },
});

export function createAgentSelfReviseTools() {
  return { [AGENT_SELF_REVISE_TOOL_ID]: agentSelfReviseTool };
}
