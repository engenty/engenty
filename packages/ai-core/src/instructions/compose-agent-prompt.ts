/**
 * Assemble the copilot/system prompt from resolved instruction layers plus specialist content.
 */
export interface AgentLayeredPromptInput {
  /**
   * Ordered AGENTS.md bodies to cascade, lowest precedence first
   * (tenant base → per-agent). Composed like nested coding-agent AGENTS.md:
   * broader rules first, agent-specific rules last so they can refine them.
   */
  agentsLayers?: string[];
  /** Convenience single AGENTS.md body, appended after `agentsLayers`. */
  agentsPrompt?: string;
  /** Optional coordinator note (e.g. sticky/switch hint). */
  coordinatorNote?: string;
  /** Include agents layer(s). Default true. */
  includeAgents?: boolean;
  /** Include soul layer(s). Default true. */
  includeSoul?: boolean;
  /** Optional runtime rules (e.g. UI language). */
  runtimeRules?: string;
  /** Ordered SOUL.md bodies, lowest precedence first (tenant base → per-agent). */
  soulLayers?: string[];
  /** Convenience single SOUL.md body, appended after `soulLayers`. */
  soulPrompt?: string;
  /** Specialist- or route-specific prompt (required). */
  specialistPrompt: string;
}

function collectLayers(layers?: string[], single?: string): string[] {
  return [...(layers ?? []), ...(single ? [single] : [])]
    .map((layer) => layer?.trim())
    .filter((layer): layer is string => Boolean(layer));
}

/**
 * Build full system prompt: optional runtime rules, cascaded AGENTS + SOUL
 * layers (tenant base → per-agent), specialist, coordinator.
 */
export function buildAgentLayeredPrompt(
  input: AgentLayeredPromptInput
): string {
  const {
    agentsLayers,
    agentsPrompt,
    coordinatorNote = "",
    includeAgents = true,
    includeSoul = true,
    runtimeRules = "",
    soulLayers,
    soulPrompt,
    specialistPrompt,
  } = input;

  const parts: string[] = [];

  if (runtimeRules) {
    parts.push(runtimeRules);
  }
  if (includeAgents) {
    parts.push(...collectLayers(agentsLayers, agentsPrompt));
  }
  if (includeSoul) {
    parts.push(...collectLayers(soulLayers, soulPrompt));
  }
  parts.push(specialistPrompt);
  if (coordinatorNote) {
    parts.push(coordinatorNote);
  }

  return parts.join("\n\n");
}
