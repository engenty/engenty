import {
  AGENT_STARTER_WHAT_CAN_YOU_DO_ID,
  type AgentDeskAgent,
  type AgentDeskStarter,
  mergeGeneratedStarters,
} from "@engenty/ai-core/browser";

type Translate = (key: string) => string;

interface StarterDef {
  id: string;
  labelKey: string;
  promptKey: string;
}

const GENERIC_STARTERS: StarterDef[] = [
  {
    id: "find-contacts",
    labelKey: "copilot.empty.starters.findContacts.label",
    promptKey: "copilot.empty.starters.findContacts.prompt",
  },
  {
    id: "draft-follow-up",
    labelKey: "copilot.empty.starters.draftFollowUp.label",
    promptKey: "copilot.empty.starters.draftFollowUp.prompt",
  },
  {
    id: "plan-work",
    labelKey: "copilot.empty.starters.planWork.label",
    promptKey: "copilot.empty.starters.planWork.prompt",
  },
];

const WHAT_CAN_YOU_DO: StarterDef = {
  id: AGENT_STARTER_WHAT_CAN_YOU_DO_ID,
  labelKey: "copilot.empty.starters.whatCanYouDo.label",
  promptKey: "copilot.empty.starters.whatCanYouDo.prompt",
};

function localize(tc: Translate, def: StarterDef): AgentDeskStarter {
  return {
    id: def.id,
    label: tc(def.labelKey),
    prompt: tc(def.promptKey),
  };
}

/**
 * Catalogue chips for a specialist start page. Declared starters come from
 * the feed (`agent.starters`); unknown agents with an empty catalogue fall
 * back to the generic three. "What can you do?" is framework-owned and
 * always appended.
 */
export function agentDeskEmptyStarters(
  tc: Translate,
  agent?: Pick<AgentDeskAgent, "starters"> | null
): AgentDeskStarter[] {
  const declared = agent?.starters ?? [];
  const jobs =
    declared.length > 0
      ? declared
      : GENERIC_STARTERS.map((def) => localize(tc, def));
  return [...jobs, localize(tc, WHAT_CAN_YOU_DO)];
}

/** Merge generated job chips into the catalogue without touching "What can you do?". */
export function mergeAgentDeskStarters(
  catalogue: readonly AgentDeskStarter[],
  generated: readonly AgentDeskStarter[] | undefined
): AgentDeskStarter[] {
  if (!generated || generated.length === 0) {
    return [...catalogue];
  }
  const framework = catalogue.filter(
    (item) => item.id === AGENT_STARTER_WHAT_CAN_YOU_DO_ID
  );
  const jobs = catalogue.filter(
    (item) => item.id !== AGENT_STARTER_WHAT_CAN_YOU_DO_ID
  );
  return [...mergeGeneratedStarters(jobs, generated), ...framework];
}
