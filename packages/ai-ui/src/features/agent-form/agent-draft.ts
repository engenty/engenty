// Draft state + validation for the custom-agent form (create + edit).

import {
  type AgentEngentyKind,
  type AgentStarter,
  DEFAULT_AI_CHAT_MODEL_ID,
  resolveAgentEngenty,
} from "@engenty/ai-core/browser";
import type { CustomAgentConfig } from "../../lib/admin/ai-runtime-api";

export interface AgentDraftStarter {
  id: string;
  label: string;
  labelDe: string;
  prompt: string;
  promptDe: string;
}

export interface AgentDraft {
  agentScope: "personal" | "shared";
  /** Preferred connector ids; empty = all plugins enabled on the active space. */
  connectorIds: string[];
  description: string;
  engenty: AgentEngentyKind;
  id: string;
  instructions: string;
  model: string;
  name: string;
  skillIds: string[];
  /** Create-only: spaces to mount after save. Ignored on edit. */
  spaceIds: string[];
  starters: AgentDraftStarter[];
  subAgentsText: string;
  toolIds: string[];
}

const DEFAULT_AGENT_MODEL = DEFAULT_AI_CHAT_MODEL_ID;

export function createEmptyAgentDraft(): AgentDraft {
  return {
    agentScope: "shared",
    description: "",
    engenty: "round",
    id: "",
    instructions:
      "You are an Engenty agent. Help the user with the configured task and use tools only when they are relevant.",
    model: DEFAULT_AGENT_MODEL,
    name: "",
    skillIds: [],
    connectorIds: [],
    spaceIds: [],
    starters: [],
    subAgentsText: "",
    toolIds: [],
  };
}

export function createAgentDraft(agent: CustomAgentConfig): AgentDraft {
  return {
    agentScope: agent.agentScope ?? "shared",
    description: agent.description ?? "",
    engenty: resolveAgentEngenty(agent.id, agent.engenty),
    id: agent.id,
    instructions: agent.instructions,
    model: agent.model,
    name: agent.name,
    skillIds: [...agent.skillIds],
    connectorIds: [...(agent.connectorIds ?? [])],
    spaceIds: [],
    starters: (agent.starters ?? []).map(starterToDraft),
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

export function validateAgentDraft(
  draft: AgentDraft,
  options?: { requireSpaces?: boolean }
): string | null {
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
  if (options?.requireSpaces && draft.spaceIds.length < 1) {
    return "At least one space is required.";
  }
  return null;
}

export function buildAgentConfigFromDraft(
  draft: AgentDraft
): CustomAgentConfig {
  const subAgents = parseAgentSubAgentsInput(draft.subAgentsText);
  return {
    agentScope: draft.agentScope,
    description: draft.description.trim() || undefined,
    engenty: draft.engenty,
    id: draft.id.trim(),
    instructions: draft.instructions.trim(),
    model: draft.model.trim(),
    name: draft.name.trim(),
    skillIds: [...new Set(draft.skillIds)],
    ...(draft.connectorIds.length > 0
      ? { connectorIds: [...new Set(draft.connectorIds)] }
      : {}),
    starters: draftStartersToConfig(draft.starters),
    subAgents: subAgents.length > 0 ? subAgents : undefined,
    toolIds: [...new Set(draft.toolIds)],
  };
}

function starterToDraft(starter: AgentStarter): AgentDraftStarter {
  return {
    id: starter.id,
    label: starter.label,
    labelDe: starter.locales?.de?.label ?? "",
    prompt: starter.prompt,
    promptDe: starter.locales?.de?.prompt ?? "",
  };
}

function draftStartersToConfig(
  starters: AgentDraftStarter[]
): AgentStarter[] | undefined {
  const result: AgentStarter[] = [];
  for (const starter of starters) {
    const id = starter.id.trim();
    const label = starter.label.trim();
    const prompt = starter.prompt.trim();
    if (!(id && label && prompt)) {
      continue;
    }
    const labelDe = starter.labelDe.trim();
    const promptDe = starter.promptDe.trim();
    result.push({
      id,
      label,
      prompt,
      ...(labelDe && promptDe
        ? { locales: { de: { label: labelDe, prompt: promptDe } } }
        : {}),
    });
  }
  return result.length > 0 ? result : undefined;
}
