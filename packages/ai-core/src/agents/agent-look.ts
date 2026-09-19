import {
  type AgentEngentyKind,
  isAgentEngentyKind,
  resolveAgentEngenty,
} from "./agent-engenty.js";

/** Color token each silhouette wears. Keep in sync with ui-core `ENGENTY_KIND_FILL`. */
export const AGENT_ENGENTY_COLORS = {
  bean: "teal",
  dome: "moss",
  drop: "amber",
  flame: "rose",
  oval: "ember",
  pebble: "slate",
  round: "cobalt",
  sprout: "citron",
  tower: "violet",
  wedge: "magenta",
} as const satisfies Record<AgentEngentyKind, string>;

export interface AgentEngentyLook {
  color: (typeof AGENT_ENGENTY_COLORS)[AgentEngentyKind];
  kind: AgentEngentyKind;
  silhouette: string;
  vibe: string;
  when: string;
}

/**
 * The ten blob faces a hired Engenty can wear. Style is the silhouette;
 * color is locked to that kind in the brand system.
 */
export const AGENT_ENGENTY_LOOKS: readonly AgentEngentyLook[] = [
  {
    kind: "round",
    color: "cobalt",
    silhouette: "round pebble",
    vibe: "Steady and approachable — the face people already know.",
    when: "Leads, generalists, the first Engenty in a Space.",
  },
  {
    kind: "drop",
    color: "amber",
    silhouette: "teardrop",
    vibe: "Warm, useful, a little eager.",
    when: "Ops, follow-up, assistants who chase work down.",
  },
  {
    kind: "dome",
    color: "moss",
    silhouette: "low dome",
    vibe: "Quiet and collected.",
    when: "Knowledge, libraries, things that sit still until asked.",
  },
  {
    kind: "flame",
    color: "rose",
    silhouette: "rising flame",
    vibe: "Voice and heat.",
    when: "Writing, marketing, anything that has to sound like someone.",
  },
  {
    kind: "oval",
    color: "ember",
    silhouette: "wide oval",
    vibe: "Craft and judgement.",
    when: "Visual work, brand, review.",
  },
  {
    kind: "bean",
    color: "teal",
    silhouette: "kidney bean",
    vibe: "Curious, slightly sideways.",
    when: "Research, analysis, looking things up.",
  },
  {
    kind: "pebble",
    color: "slate",
    silhouette: "flat pebble",
    vibe: "Unfussy and durable.",
    when: "Time, tracking, quiet back-office jobs.",
  },
  {
    kind: "sprout",
    color: "citron",
    silhouette: "sprout with a stem",
    vibe: "New growth.",
    when: "Learning, coaching, identity, anything just getting started.",
  },
  {
    kind: "tower",
    color: "violet",
    silhouette: "tall tower",
    vibe: "Upright, a bit formal.",
    when: "Strategy, architecture, people who hold a line.",
  },
  {
    kind: "wedge",
    color: "magenta",
    silhouette: "sharp wedge",
    vibe: "Decisive, a cutter.",
    when: "Inbox, triage, routing, anything that sorts a pile.",
  },
];

const LOOK_BY_KIND = new Map(
  AGENT_ENGENTY_LOOKS.map((look) => [look.kind, look])
);

export function agentEngentyLook(
  kind: AgentEngentyKind
): AgentEngentyLook | undefined {
  return LOOK_BY_KIND.get(kind);
}

const KEYWORD_KIND: Array<{ kind: AgentEngentyKind; pattern: RegExp }> = [
  {
    kind: "round",
    pattern:
      /\b(lead|chief|staff|generalist|coordinator|first|default|owner)\b/i,
  },
  {
    kind: "drop",
    pattern: /\b(ops|operat|assistant|follow[- ]?up|chase|back[- ]?office)\b/i,
  },
  {
    kind: "dome",
    pattern: /\b(knowledge|wiki|librar|docs?|archive|faq)\b/i,
  },
  {
    kind: "flame",
    pattern: /\b(market|copy|writer|voice|campaign|brand voice)\b/i,
  },
  {
    kind: "oval",
    pattern: /\b(art|design|visual|brand|layout|portrait|look|avatar)\b/i,
  },
  {
    kind: "bean",
    pattern: /\b(research|analyst|investigat|prospect|source)\b/i,
  },
  {
    kind: "pebble",
    pattern: /\b(time|track|timesheet|quiet|log)\b/i,
  },
  {
    kind: "sprout",
    pattern: /\b(learn|coach|teach|grow|identity|looksmith|onboard)\b/i,
  },
  {
    kind: "tower",
    pattern: /\b(strateg|architect|exec|policy|govern)\b/i,
  },
  {
    kind: "wedge",
    pattern: /\b(inbox|triage|rout|sort|mail|ticket)\b/i,
  },
];

export interface SuggestAgentLookInput {
  description?: string | null;
  id?: string | null;
  instructions?: string | null;
  name?: string | null;
}

export interface SuggestedAgentLook {
  description: string;
  look: AgentEngentyLook;
  name: string;
  rationale: string;
}

function firstSentence(text: string, max = 180): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "";
  }
  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  const sentence = (match?.[1] ?? trimmed).trim();
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

function titleFromJob(text: string, fallback: string): string {
  const words = text
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 5)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  const name = words.join(" ").trim();
  return name || fallback;
}

/** Pick a blob (and a name/description hint) from what the Engenty is for. */
export function suggestAgentLook(
  input: SuggestAgentLookInput
): SuggestedAgentLook {
  const haystack = [input.name, input.description, input.instructions]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n");
  let kind: AgentEngentyKind | null = null;
  for (const entry of KEYWORD_KIND) {
    if (entry.pattern.test(haystack)) {
      kind = entry.kind;
      break;
    }
  }
  const resolved =
    kind ?? resolveAgentEngenty(input.id?.trim() || haystack || "engenty");
  const look = agentEngentyLook(resolved) ?? AGENT_ENGENTY_LOOKS[0]!;
  const name = input.name?.trim() || titleFromJob(haystack, "Engenty");
  const description =
    input.description?.trim() ||
    firstSentence(haystack) ||
    `An Engenty that ${look.when.charAt(0).toLowerCase()}${look.when.slice(1)}`;
  return {
    description,
    look,
    name,
    rationale: kind
      ? `${look.kind} (${look.color}) fits this job: ${look.when}`
      : `No strong style cue — ${look.kind} (${look.color}) is a stable pick from the name.`,
  };
}

export function parseAgentEngentyKind(value: unknown): AgentEngentyKind | null {
  return isAgentEngentyKind(value) ? value : null;
}
