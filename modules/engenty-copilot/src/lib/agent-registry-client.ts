import type { AgentConfig } from "@engenty/ai-core/browser";
import { agentRequestHeaders, registryAgentsPath } from "./agent-api-shared.js";

export async function listRegistryAgents(params: {
  serviceBaseUrl: string;
  signal?: AbortSignal;
}): Promise<AgentConfig[]> {
  const res = await fetch(registryAgentsPath(params.serviceBaseUrl), {
    method: "GET",
    headers: await agentRequestHeaders(),
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `ai registry agents list HTTP ${res.status}: ${raw.slice(0, 500)}`
    );
  }
  const parsed = JSON.parse(raw) as { agents?: unknown };
  if (!Array.isArray(parsed.agents)) {
    throw new Error("ai registry agents list: missing agents array");
  }
  return parsed.agents as AgentConfig[];
}
