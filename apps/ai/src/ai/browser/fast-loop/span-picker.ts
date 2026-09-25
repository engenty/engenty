// Field values without generation: the goal is cut into candidate spans
// (dates, names, numbers, quoted strings) and the classifier picks, per
// typeable field, which span is that field's value — or NONE. A span picker
// cannot invent a value, which is the contract the text helper promises
// ("it never invents data"); what it cannot do is rewrite one, so NONE and a
// close call fall through to the LLM helper (PLAN-browser-fast-loop.md §9.4 Q3).

import {
  type ChoiceQuestion,
  type ClassifierClient,
  validateChoiceAnswer,
} from "@engenty/typesafe-client";

import { SPAN_VALUE } from "./instructions.js";
import type { FieldContext, FieldDescription } from "./text-helper.js";

/** At most this many spans are offered; beyond that the goal is prose, not values. */
export const MAX_SPANS = 20;
/** A span must lead the runner-up by this much of the head's mass. */
export const SPAN_MIN_MARGIN = 0.2;
export const NONE = "NONE";

const MONTH =
  "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Jän|Mär|Mai|Okt|Dez)[a-zäö]*\\.?";
const SPAN_PATTERNS: readonly RegExp[] = [
  // "12 Oct 2026", "12. Oktober 2026", "Oct 12, 2026", "October 12"
  new RegExp(
    `\\b\\d{1,2}\\.?\\s?${MONTH}(?:,?\\s\\d{4})?\\b|\\b${MONTH}\\s\\d{1,2}(?:,?\\s\\d{4})?\\b`,
    "gi"
  ),
  // 2026-10-12, 12.10.2026, 10/12/2026, 12.10.
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/g,
  // "quoted" or 'quoted' or „quoted“
  /["“„']([^"“”„']{1,80})["”“']/g,
  // e-mail
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
  // number with a unit or currency: 1 126 €, €1,126, 2 adults, 3 nights
  /(?:[€$£]\s?\d[\d.,\s]*\d|\b\d[\d.,]*\s?(?:€|EUR|USD|\$|£|%|kg|km|adults?|nights?|persons?|people|passengers?|rooms?|days?|hours?|h))\b/gi,
  // runs of capitalised words, incl. "Seoul, South Korea", "New York"
  /\b(?:\p{Lu}[\p{L}\p{M}'’-]+)(?:(?:,\s|\s)(?:\p{Lu}[\p{L}\p{M}'’-]+))*\b/gu,
  // bare integers
  /\b\d{1,9}\b/g,
];

const SENTENCE_STARTERS = new Set([
  "a",
  "an",
  "and",
  "book",
  "click",
  "enter",
  "fill",
  "find",
  "for",
  "from",
  "go",
  "in",
  "on",
  "open",
  "pick",
  "search",
  "select",
  "set",
  "the",
  "then",
  "to",
  "type",
  "use",
  "with",
]);

/**
 * Candidate values in the goal, in order of appearance, deduplicated. A
 * quoted span is offered without its quotes. A lone capitalised word that is
 * only a sentence start ("Search flights…") is not a value.
 */
export function extractSpans(goal: string): string[] {
  const found: { index: number; text: string }[] = [];
  for (const pattern of SPAN_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of goal.matchAll(pattern)) {
      const text = (match[1] ?? match[0]).trim();
      if (!text) {
        continue;
      }
      found.push({ index: match.index ?? 0, text });
    }
  }
  found.sort((a, b) => a.index - b.index);
  const spans: string[] = [];
  const seen = new Set<string>();
  for (const { index, text } of found) {
    if (seen.has(text)) {
      continue;
    }
    if (
      /^\p{Lu}[\p{L}]*$/u.test(text) &&
      SENTENCE_STARTERS.has(text.toLowerCase()) &&
      (index === 0 || /[.!?;:]\s*$/.test(goal.slice(0, index)))
    ) {
      continue;
    }
    seen.add(text);
    spans.push(text);
    if (spans.length >= MAX_SPANS) {
      break;
    }
  }
  return spans;
}

export interface SpanPick {
  latency_ms: number;
  /** Per field label: the chosen span, or null for NONE / a close call. */
  values: Map<string, string | null>;
}

/** Head key per field: `field_1`, `field_2`, … in the fields' order. */
function headKey(position: number): string {
  return `field_${position + 1}`;
}

/**
 * One classifier call for every typeable field on the page: which span, if
 * any, is that field's value. Returns null when the goal offers no spans.
 */
export async function pickSpans(input: {
  client: ClassifierClient;
  context: FieldContext;
  model?: string;
}): Promise<SpanPick | null> {
  const spans = extractSpans(input.context.goal);
  if (spans.length === 0) {
    return null;
  }
  const ids = spans.map((_, i) => `s${i + 1}`);
  const criteria: Record<string, string> = {
    [NONE]: "No offered piece is this field's value.",
  };
  ids.forEach((id, i) => {
    criteria[id] = spans[i] as string;
  });
  const fields = input.context.fields;
  const questions: Record<string, ChoiceQuestion> = {};
  fields.forEach((field: FieldDescription, i) => {
    questions[headKey(i)] = {
      criteria,
      instructions: {
        field: { label: field.label, role: field.role, value: field.value },
        goal: input.context.goal,
        rules: SPAN_VALUE,
      },
      type: "choice",
    };
  });
  const startedAt = performance.now();
  const result = await input.client.systemOne({
    ...(input.model ? { model: input.model } : {}),
    questions,
    state: {
      fields: fields as unknown as Record<string, never>[],
      goal: input.context.goal,
      page: input.context.page,
      recent_actions: input.context.recent_actions,
    },
  });
  const latency_ms = Math.round(performance.now() - startedAt);
  const values = new Map<string, string | null>();
  const offered = [NONE, ...ids];
  fields.forEach((field, i) => {
    const answer = validateChoiceAnswer(result.answers[headKey(i)], offered);
    const ranked = Object.entries(answer.probabilities).sort(
      (a, b) => b[1] - a[1]
    );
    const [best, second] = ranked;
    const margin = (best?.[1] ?? 0) - (second?.[1] ?? 0);
    if (!best || best[0] === NONE || margin < SPAN_MIN_MARGIN) {
      values.set(field.label, null);
      return;
    }
    values.set(field.label, spans[ids.indexOf(best[0])] ?? null);
  });
  return { latency_ms, values };
}
