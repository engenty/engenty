// agent_status: what a colleague is up to, read-only.
//
// The desk feed the person sees, handed to an agent: lanes (waiting, active,
// conversation, assigned, completed), the newest engagements, and the last
// thing the colleague said in its room. This is the PULL half of agents
// talking — `message_agent { mode: "notify" }` hands work over without waiting,
// and this is how the sender finds out what became of it without a second
// message. Nothing here writes.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  AgentDeskNotFoundError,
  type AgentDeskServiceDependencies,
  buildAgentDeskFeed,
} from "../../src/agent-desk/service.js";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../../src/ai/core-http-client.js";
import { createThreadStoreFromEnv } from "../../src/ai/index.js";
import type { AgentConfig } from "../../src/ai/registry/types.js";
import type { ThreadStore } from "../../src/dal/threads/thread-store.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import { isUnresolvedSpaceGate } from "./engenty-tools/lib/space-gate.js";

export const AGENT_STATUS_TOOL_ID = "agent_status";

const ENGAGEMENT_LIMIT = 8;
const EXCERPT_CHARS = 600;

const agentStatusOutputSchema = z.object({
  agent: z.object({ id: z.string(), name: z.string() }),
  engagements: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      lane: z.string(),
      status: z.string(),
      title: z.string(),
      updated_at: z.string(),
    })
  ),
  /** The colleague's last words in its newest room, when it has spoken. */
  last_reply: z
    .object({ at: z.string(), excerpt: z.string(), thread_id: z.string() })
    .nullable(),
  lane_counts: z.record(z.string(), z.number()),
});

export interface AgentStatusToolDeps {
  /** Test seam; production reads the env-configured store. */
  threadStore?: () => ThreadStore | null;
}

/** The registry row, through core's `/ai/registry` proxy — the same door
 * `registry_agents_list` uses, so a tool needs no registry handle. */
async function fetchAgentConfig(input: {
  accessToken: string;
  agentId: string;
  coreBaseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<AgentConfig | undefined> {
  const doFetch = input.fetchImpl ?? fetch;
  const response = await doFetch(
    `${input.coreBaseUrl.replace(/\/$/, "")}/ai/registry/agents/${encodeURIComponent(input.agentId)}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.accessToken}`,
      },
    }
  );
  if (response.status === 404) {
    return;
  }
  if (!response.ok) {
    throw new Error(
      `agent_status: GET /ai/registry/agents/${input.agentId} returned HTTP ${response.status}`
    );
  }
  const data = (await response.json()) as { agent?: AgentConfig };
  return data.agent;
}

function textOfParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .filter(
      (part): part is { text: string; type: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    )
    .map((part) => part.text)
    .join("")
    .trim();
}

export function createAgentStatusTool(deps: AgentStatusToolDeps = {}) {
  return createTool({
    id: AGENT_STATUS_TOOL_ID,
    description:
      'What a colleague in this Space is doing: its waiting/active/completed work, newest conversations and routine runs, and the last thing it said in its room. Read-only. Use it after `message_agent { mode: "notify" }` to see whether the work is done, or before handing something over to see whether the colleague is already busy.',
    inputSchema: z.object({
      agent_id: z
        .string()
        .min(1)
        .describe("Exact agent id from registry_agents_list."),
    }),
    outputSchema: agentStatusOutputSchema,
    execute: async ({ agent_id }) => {
      const ctx = getEngentyToolsRunContext();
      const tenantId = ctx.tenantId?.trim();
      if (!tenantId) {
        throw new Error("agent_status is unavailable in this run (no tenant).");
      }
      if (isUnresolvedSpaceGate(ctx.space)) {
        throw new Error(
          "agent_status: this run's Space could not be resolved; refusing."
        );
      }
      const spaceId = ctx.space?.spaceId;
      if (!spaceId) {
        throw new Error(
          "agent_status: only works inside a Space (a colleague's desk is per Space)."
        );
      }
      const coreBaseUrl = ctx.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
      if (!(ctx.accessToken && coreBaseUrl)) {
        throw new Error("agent_status: core is not reachable from this run.");
      }
      const store = (deps.threadStore ?? createThreadStoreFromEnv)();
      if (!store) {
        throw new Error("agent_status: thread store is not configured.");
      }
      const core = new EngentyCoreClient({
        accessToken: ctx.accessToken,
        coreBaseUrl,
        ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
      });
      const accessToken = ctx.accessToken;
      const dependencies: AgentDeskServiceDependencies = {
        getAgent: (agentId) =>
          fetchAgentConfig({
            accessToken,
            agentId,
            coreBaseUrl,
            ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
          }),
        getSpaceSurface: (id) => core.getSpaceSurface(id),
        listSpaces: () => core.listSpaces(),
        // Tasks are a second module call a status glance rarely needs; the
        // desk's own lanes over threads already say waiting / active / done.
        listTasks: async () => [],
        listThreads: ({ agentId, limit, spaceId: id }) =>
          store.listThreadsForSpaceAgent({
            agentId,
            limit,
            spaceId: id,
            tenantId,
          }),
      };
      let feed: Awaited<ReturnType<typeof buildAgentDeskFeed>>;
      try {
        feed = await buildAgentDeskFeed({
          agentId: agent_id.trim(),
          dependencies,
          limit: ENGAGEMENT_LIMIT,
          spaceId,
        });
      } catch (error) {
        if (error instanceof AgentDeskNotFoundError) {
          throw new Error(
            `agent_status: ${agent_id} is not mounted in this Space. Use an id from registry_agents_list.`
          );
        }
        throw error;
      }
      const newestRoom = feed.engagements.find(
        (engagement) =>
          engagement.kind === "conversation" &&
          engagement.metadata.routine_id == null
      );
      let lastReply: z.infer<typeof agentStatusOutputSchema>["last_reply"] =
        null;
      const threadId = newestRoom?.metadata.thread_id;
      if (typeof threadId === "string") {
        const messages = await store.listMessagesOrdered({
          tenantId,
          threadId,
        });
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const message = messages[index];
          if (message?.role !== "assistant") {
            continue;
          }
          const text = textOfParts(message.parts);
          if (text) {
            lastReply = {
              at: message.created_at,
              excerpt:
                text.length > EXCERPT_CHARS
                  ? `${text.slice(0, EXCERPT_CHARS)}…`
                  : text,
              thread_id: threadId,
            };
            break;
          }
        }
      }
      return {
        agent: { id: feed.agent.id, name: feed.agent.name },
        engagements: feed.engagements.map((engagement) => ({
          id: engagement.id,
          kind: engagement.kind,
          lane: engagement.lane,
          status: engagement.status,
          title: engagement.title,
          updated_at: engagement.sort_at,
        })),
        last_reply: lastReply,
        lane_counts: feed.lane_counts,
      };
    },
  });
}

export function createAgentStatusTools(deps: AgentStatusToolDeps = {}) {
  return { [AGENT_STATUS_TOOL_ID]: createAgentStatusTool(deps) };
}
