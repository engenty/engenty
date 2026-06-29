// Draft state + validation for the custom-agent form (create + edit).

import type { CustomAgentConfig } from "../../lib/admin/ai-runtime-api";

export interface AgentDraft {
  description: string;
  id: string;
  instructions: string;
  model: string;
  name: string;
  skillIds: string[];
  subAgentsText: string;
  toolIds: string[];
}

const DEFAULT_AGENT_MODEL = "openai/gpt-5-mini";

export function createEmptyAgentDraft(): AgentDraft {
  return {
    description: "",
    id: "",
    instructions:
      "You are an Engenty agent. Help the user with the configured task and use tools only when they are relevant.",
    model: DEFAULT_AGENT_MODEL,
    name: "",
    skillIds: [],
    subAgentsText: "",
    toolIds: [],
  };
}

export function createAgentDraft(agent: CustomAgentConfig): AgentDraft {
  return {
    description: agent.description ?? "",
    id: agent.id,
    instructions: agent.instructions,
    model: agent.model,
    name: agent.name,
    skillIds: [...agent.skillIds],
    subAgentsText: (agent.subAgents ?? [])
      .map((entry) =>
        entry.alias ? `${entry.id} as ${entry.alias}` : entry.id
      )
      .join("\n"),
    toolIds: [...agent.toolIds],
  };
}

export function parseAgentSubAgentsInput(value: string): {
  alias?: string;
  id: string;
}[] {
  const rows = value
    .split(/\n+/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const result: { alias?: string; id: string }[] = [];
  for (const row of rows) {
    const match = row.match(/^(.+?)\s+as\s+(.+)$/iu);
    const id = (match?.[1] ?? row).trim();
    const alias = match?.[2]?.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(alias ? { alias, id } : { id });
  }
  return result;
}

export function validateAgentDraft(draft: AgentDraft): string | null {
  const id = draft.id.trim();
  if (!/^[a-z0-9]+(?:[.-][a-z0-9-]+)*$/u.test(id)) {
    return "Agent id must use lowercase letters or digits, with optional dot or hyphen segments.";
  }
  if (!draft.name.trim()) {
    return "Agent name is required.";
  }
  if (!draft.model.trim()) {
    return "Model id is required.";
  }
  if (!draft.instructions.trim()) {
    return "Instructions are required.";
  }
  const selfReference = parseAgentSubAgentsInput(draft.subAgentsText).some(
    (entry) => entry.id === id
  );
  if (selfReference) {
    return "An agent cannot list itself as a sub-agent.";
  }
  return null;
}

export function buildAgentConfigFromDraft(
  draft: AgentDraft
): CustomAgentConfig {
  const subAgents = parseAgentSubAgentsInput(draft.subAgentsText);
  return {
    description: draft.description.trim() || undefined,
    id: draft.id.trim(),
    instructions: draft.instructions.trim(),
    model: draft.model.trim(),
    name: draft.name.trim(),
    skillIds: [...new Set(draft.skillIds)],
    subAgents: subAgents.length > 0 ? subAgents : undefined,
    toolIds: [...new Set(draft.toolIds)],
  };
}
