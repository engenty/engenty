/** Silhouettes an agent can wear. Keep in sync with ui-core `ENGENTY_KINDS`. */
export const AGENT_ENGENTY_KINDS = [
  "round",
  "drop",
  "dome",
  "flame",
  "oval",
  "bean",
  "pebble",
  "sprout",
  "tower",
  "wedge",
] as const;

export type AgentEngentyKind = (typeof AGENT_ENGENTY_KINDS)[number];

const KIND_SET = new Set<string>(AGENT_ENGENTY_KINDS);
const DEFAULT_KIND: AgentEngentyKind = "round";

export function isAgentEngentyKind(value: unknown): value is AgentEngentyKind {
  return typeof value === "string" && KIND_SET.has(value);
}

/** Stable character from a saved preference, else a hash of the agent id. */
export function resolveAgentEngenty(
  agentId: string,
  stored?: string | null
): AgentEngentyKind {
  if (isAgentEngentyKind(stored)) {
    return stored;
  }
  let hash = 0;
  for (const char of agentId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003;
  }
  return AGENT_ENGENTY_KINDS[hash % AGENT_ENGENTY_KINDS.length] ?? DEFAULT_KIND;
}
