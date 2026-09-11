import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getEngentyCoreBaseUrlFromEnv } from "../../src/ai/core-http-client.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import { isUnresolvedSpaceGate } from "./engenty-tools/lib/space-gate.js";

interface AgentSummary {
  description?: string;
  id: string;
  name: string;
}

interface AgentListResponse {
  agents: AgentSummary[];
}

// Lets live orchestrators see the agent_type_keys they may actually address:
// Space-mounted agents for a resolved Space, tenant-wide only when the run
// intentionally has no Space.
export const registryAgentsListTool = createTool({
  id: "registry_agents_list",
  description:
    "List available agents (id, name, description). In a resolved Space this returns only mounted agents; an intentional no-Space run returns the tenant registry. Call before messaging or assigning, and use only ids returned here.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    agents: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
      })
    ),
  }),
  execute: async () => {
    const ctx = getEngentyToolsRunContext();
    if (isUnresolvedSpaceGate(ctx.space)) {
      throw new Error(
        `registry_agents_list: claimed Space ${ctx.space.claimed_space_id} could not be resolved (${ctx.space.reason}); refusing tenant-wide fallback.`
      );
    }
    const mountedAgentIds = ctx.space?.agentIds;
    if (ctx.space && (!mountedAgentIds || mountedAgentIds.size === 0)) {
      return { agents: [] };
    }
    const baseUrl = (
      ctx.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv()
    )?.replace(/\/$/, "");
    if (!baseUrl) {
      throw new Error(
        "registry_agents_list: coreBaseUrl is not set in run context."
      );
    }
    const headers: Record<string, string> = {
      accept: "application/json",
    };
    if (ctx.accessToken) {
      headers.authorization = `Bearer ${ctx.accessToken}`;
    }
    const response = await fetch(`${baseUrl}/ai/registry/agents`, { headers });
    if (!response.ok) {
      throw new Error(
        `registry_agents_list: GET /ai/registry/agents returned HTTP ${response.status}`
      );
    }
    const data = (await response.json()) as AgentListResponse;
    const agents = data.agents ?? [];
    return {
      agents: mountedAgentIds
        ? agents.filter((agent) => mountedAgentIds.has(agent.id))
        : agents,
    };
  },
});
