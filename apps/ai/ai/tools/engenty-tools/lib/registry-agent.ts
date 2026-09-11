// Registry lookup for tools that name an agent (routines' owner, a proposed
// Action's owner). Over the core proxy, because a tool run holds no registry
// handle of its own.
import { getEngentyCoreBaseUrlFromEnv } from "../../../../src/ai/core-http-client.js";
import { getEngentyToolsRunContext } from "./run-context.js";

export interface RegistryAgentRecord {
  id: string;
  kind?: "chat_surface" | "delegated" | "interface" | "specialist";
}

/**
 * Resolve an agent id in the tenant's registry.
 *
 * `null` = the agent does not exist in this tenant; `undefined` = the
 * registry was unreachable — the caller decides whether that refuses the
 * write (routines: yes) or lets an inert draft through (workflow_propose).
 */
export async function resolveRegistryAgent(
  agentId: string
): Promise<RegistryAgentRecord | null | undefined> {
  const ctx = getEngentyToolsRunContext();
  const baseUrl = (ctx.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv())?.replace(
    /\/$/,
    ""
  );
  if (!baseUrl) {
    return;
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (ctx.accessToken) {
    headers.authorization = `Bearer ${ctx.accessToken}`;
  }
  try {
    const response = await fetch(
      `${baseUrl}/ai/registry/agents/${encodeURIComponent(agentId)}`,
      { headers }
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as {
      agent?: RegistryAgentRecord;
    };
    return data.agent ?? undefined;
  } catch {
    return;
  }
}
