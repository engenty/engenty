import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";

interface AgentSummary {
  description?: string;
  id: string;
  name: string;
}

interface AgentListResponse {
  agents: AgentSummary[];
}

// Lets planner agents (coordinator, future channel orchestrators) see which
// agent_type_keys are actually registered instead of relying on static tables.
export const registryAgentsListTool = createTool({
  id: "registry_agents_list",
  description:
    "List all registered agents (id, name, description). Call this before assigning a task to an agent — only use ids returned here as primary_assignee_agent_type_key.",
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
    const baseUrl = ctx.coreBaseUrl?.replace(/\/$/, "");
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
    return { agents: data.agents ?? [] };
  },
});
