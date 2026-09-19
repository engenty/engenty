/**
 * Space hire wizard — identity in, registry payload out.
 *
 * Super Grok's create screen is name + look + a standing job. Ours maps that
 * onto a hired Engenty: `description` is the job statement stored on the
 * agent, and (when no role template is picked) it also seeds instructions so
 * the agent is not born with a generic one-liner.
 *
 * This is not a Mastra Goal. Mastra Goals are thread-scoped runtime objectives
 * with an LLM-as-judge (`setObjective` / `goal.judge`). Calling this field
 * Goal would collide with that noun. See `docs/harness/goals.md` in Mastra.
 */
import {
  AGENT_ENGENTY_KINDS,
  type AgentEngentyKind,
  DEFAULT_AI_CHAT_MODEL_ID,
  FIRST_ENGENTY_SKILL_ID,
  FIRST_ENGENTY_TEMPLATE_ID,
  FIRST_ENGENTY_TOOL_IDS,
} from "@engenty/ai-core/browser";

export {
  FIRST_ENGENTY_SKILL_ID,
  FIRST_ENGENTY_TEMPLATE_ID,
  FIRST_ENGENTY_TOOL_IDS,
} from "@engenty/ai-core/browser";

import { spaceKeyFromName } from "./space-setup-selection";

const GATEWAY_TOOLS = ["engenty_tools_search", "engenty_tool_execute"];

export interface SpaceAgentHireTemplate {
  agentId: string;
  description: string;
  instructions: string;
  name: string;
  skillIds: string[];
  templateId: string;
  toolIds: string[];
}

export interface SpaceAgentHireDraft {
  description: string;
  engenty: AgentEngentyKind;
  name: string;
  /** Agent key this hire reports to in the space; null = nobody. */
  reportsTo?: string | null;
  template: SpaceAgentHireTemplate | null;
}

/** Fallback id when the name has no slug (emoji-only, punctuation, …). */
export const FALLBACK_HIRE_AGENT_ID = "agent";

export function agentIdFromHireName(name: string): string {
  return spaceKeyFromName(name) || FALLBACK_HIRE_AGENT_ID;
}

export function hireAgentId(draft: SpaceAgentHireDraft): string {
  const name = draft.name.trim();
  if (draft.template && name === draft.template.name) {
    return draft.template.agentId;
  }
  return agentIdFromHireName(name);
}

export function hireInstructions(draft: SpaceAgentHireDraft): string {
  if (draft.template) {
    return draft.template.instructions;
  }
  const name = draft.name.trim() || "this Engenty";
  const description = draft.description.trim();
  if (!description) {
    return `You are ${name}, an Engenty in this space. Help with the work this space needs. Use tools only when they are relevant.`;
  }
  return `You are ${name}, an Engenty in this space.

## What you are here for
${description}

## How you work
- Do the job above. If it is ambiguous in a way that changes the outcome, ask one concrete question.
- Use tools only when they are relevant.
- Report what you did in plain language.`;
}

export function buildSpaceAgentHireInput(
  draft: SpaceAgentHireDraft,
  spaceId: string
): {
  agentScope: "shared";
  description?: string;
  engenty: AgentEngentyKind;
  id: string;
  instructions: string;
  model: string;
  name: string;
  reportsTo?: string;
  skillIds: string[];
  spaceIds: string[];
  toolIds: string[];
} {
  const name = draft.name.trim();
  const description = draft.description.trim();
  return {
    agentScope: "shared",
    ...(description ? { description } : {}),
    engenty: draft.engenty,
    id: hireAgentId(draft),
    instructions: hireInstructions(draft),
    model: DEFAULT_AI_CHAT_MODEL_ID,
    name,
    ...(draft.reportsTo ? { reportsTo: draft.reportsTo } : {}),
    skillIds: draft.template ? [...draft.template.skillIds] : [],
    spaceIds: [spaceId],
    toolIds: draft.template ? [...draft.template.toolIds] : [...GATEWAY_TOOLS],
  };
}

/**
 * The engenty a space starts with: the create-space wizard ends on this draft,
 * and the roster's hire dialog offers its template as the first suggestion —
 * a space made without the wizard (a personal one, or one whose lead left)
 * gets its Chief of Staff the same way.
 *
 * A plain registry row like any later hire — the only difference is the
 * playbook it prefers and the setup tools it carries (`FIRST_ENGENTY_TOOL_IDS`
 * in ai-core, which the assembler also unions for every hire that reports
 * to nobody). There is no chief of staff kind; renaming it re-slugs the id
 * like any other rename.
 */
export function firstEngentyDraft(
  spaceName: string,
  purpose: { description: string; name: string } | null
): SpaceAgentHireDraft {
  const space = spaceName.trim() || "this space";
  const purposeLine = purpose
    ? `This space is ${lowerFirst(purpose.description.trim())}`
    : "";
  const description = [
    `First engenty in "${space}".`,
    purposeLine,
    "Sets the space up, routes work, hires a teammate when a job deserves its own owner, and does what nobody else owns yet.",
  ]
    .filter(Boolean)
    .join(" ");
  const name = "Chief of Staff";
  const template: SpaceAgentHireTemplate = {
    agentId: agentIdFromHireName(name),
    description,
    instructions: `You are ${name}, the first engenty in "${space}".

## What you are here for
${description}

## How you work
- Start by understanding what this space is for. If that is unclear in a way that changes the outcome, ask one concrete question.
- Load the **${FIRST_ENGENTY_SKILL_ID}** skill for setup, routing and hiring — it is your playbook here.
- Do the work nobody else owns yet. When a job deserves its own owner, hire a teammate instead of keeping it.
- Report in plain language: what was done, what is open, who owns the next step.`,
    name,
    skillIds: [FIRST_ENGENTY_SKILL_ID],
    templateId: FIRST_ENGENTY_TEMPLATE_ID,
    toolIds: [...FIRST_ENGENTY_TOOL_IDS],
  };
  return { description, engenty: "round", name, template };
}

function lowerFirst(text: string): string {
  return text ? text[0]!.toLowerCase() + text.slice(1) : text;
}

export const HIRE_TEMPLATE_ENGENTY: Record<string, AgentEngentyKind> = {
  "art-director": "oval",
  [FIRST_ENGENTY_TEMPLATE_ID]: "round",
  looksmith: "sprout",
  "marketing-writer": "flame",
  "ops-assistant": "drop",
  "research-analyst": "bean",
};

export function pickRandomHireEngenty(): AgentEngentyKind {
  const index = Math.floor(Math.random() * AGENT_ENGENTY_KINDS.length);
  return AGENT_ENGENTY_KINDS[index] ?? "round";
}
