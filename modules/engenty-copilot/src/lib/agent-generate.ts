export type AiAgentMessage =
  | { content: string; role: "assistant" }
  | { content: string; role: "system" }
  | { content: string; role: "user" };

const DEFAULT_AGENT_ID = "engenty.copilot";

/**
 * `POST {serviceBaseUrl}/ai/agents/{agentId}/generate` on **`@engenty/ai`** (Mastra HTTP API).
 *
 * @param params.agentId — Mastra agent id (path segment); defaults to **`engenty.copilot`**.
 * @param params.serviceBaseUrl — Absolute `@engenty/ai` base URL with no trailing slash.
 */
export async function postAiAgentGenerate(params: {
  agentId?: string;
  messages: AiAgentMessage[];
  serviceBaseUrl: string;
  signal?: AbortSignal;
}): Promise<{ text: string }> {
  const base = params.serviceBaseUrl.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "ai: missing serviceBaseUrl (set VITE_ENGENTY_AI_BASE_URL)"
    );
  }
  const agentId = params.agentId?.trim() || DEFAULT_AGENT_ID;
  const url = `${base}/ai/agents/${encodeURIComponent(agentId)}/generate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: params.messages }),
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`ai HTTP ${res.status}: ${raw.slice(0, 500)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("ai: response was not JSON");
  }
  const text = (parsed as { text?: unknown }).text;
  if (typeof text !== "string") {
    throw new Error("ai: missing text in JSON response");
  }
  return { text };
}
