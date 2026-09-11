// Turn the drafting model's half-written reply into a live list of steps.
//
// The drafting run streams its answer — the graph JSON — token by token over
// the run stream, and that stream is the only live signal there is: the brief
// demands JSON-only output and passes no tools, so there are no tool-call
// events to narrate progress with. Parsing the partial JSON as it grows and
// pulling out the entry ids is what turns "a model is thinking" into "it just
// added the Send reminder step".

import { parsePartialJson } from "ai";

export interface DraftedStepPreview {
  /** The entry id — stable across reparses of a growing prefix. */
  key: string;
  label: string;
}

/** "draft-invoice" / "draft_invoice" → "Draft invoice". */
export function humanizeEntryId(id: string): string {
  const words = id.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Mirror of the server's `extractJsonObject`, minus the closing-brace
 * requirement — the whole point here is that the object is not finished yet.
 */
function partialJsonCandidate(text: string): string | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  return start >= 0 ? candidate.slice(start) : undefined;
}

/**
 * Depth-first over graph entries, matching the authored shapes: containers
 * carry children under `steps` (conditional, parallel) or `step` (foreach,
 * loop); every user-meaningful entry has a string `id`. Mapping entries are
 * plumbing between steps, not steps — listing "Prep send" next to "Send"
 * would double every step in the eyes of the person watching.
 */
function collectSteps(
  entries: unknown,
  rawText: string,
  out: DraftedStepPreview[]
): void {
  if (!Array.isArray(entries)) {
    return;
  }
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    // Two "has it fully streamed yet?" guards, both needed for the list to be
    // append-only while the reply grows. A cut mid-string makes the partial
    // parser repair `"check-inb` into a plausible-looking id that the next
    // parse replaces — so an id only counts once its closing quote exists in
    // the raw text. And an entry whose `type` hasn't arrived can still turn
    // out to be a mapping, so it waits until the type is known.
    if (
      typeof record.type === "string" &&
      record.type !== "mapping" &&
      typeof record.id === "string"
    ) {
      const id = record.id.trim();
      if (
        id.length > 0 &&
        rawText.includes(`"${id}"`) &&
        !out.some((step) => step.key === id)
      ) {
        out.push({ key: id, label: humanizeEntryId(id) });
      }
    }
    collectSteps(record.steps, rawText, out);
    if (record.step) {
      collectSteps([record.step], rawText, out);
    }
  }
}

/**
 * Extract the steps written so far from a partial model reply.
 *
 * Order is first-seen and keys are deduped, so across growing prefixes of the
 * same reply the result only ever appends — a list that reshuffles while the
 * user watches would read as the model changing its mind when it is merely
 * the parser recovering differently. Garbage in → empty list, never a throw.
 */
export async function extractDraftedSteps(
  text: string
): Promise<DraftedStepPreview[]> {
  const candidate = partialJsonCandidate(text);
  if (!candidate) {
    return [];
  }
  try {
    const { value } = await parsePartialJson(candidate);
    const graph =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>).graph
        : undefined;
    const out: DraftedStepPreview[] = [];
    collectSteps(graph, candidate, out);
    return out;
  } catch {
    return [];
  }
}
