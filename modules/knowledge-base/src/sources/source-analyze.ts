/**
 * Structure analysis for a source — the step that turns "here is a blank
 * instructions box" into "here is what I think this material should become".
 *
 * Writing an agentic authoring brief from scratch is the part users cannot do
 * well, because it asks them to describe a structure before they have seen
 * what is in the source. The analyzer reads a sample of the synced items and
 * drafts the brief for them, which they then edit rather than invent.
 *
 * It only proposes. Nothing is written to the KB, so running it is always safe
 * and repeatable.
 */

import {
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
} from "@engenty/ai-core";
import { generateText, Output } from "ai";
import type { KbRepoFactory } from "../dal/contracts.js";
import {
  type KbSourceAnalysis,
  kbSourceAnalysisSchema,
} from "../schema/sources.js";

/** Total prompt budget for the sampled excerpts. */
const ANALYSIS_BUDGET_CHARS = 40_000;
/** Floor per item, so a wide sample still shows more than a page header. */
const MIN_ITEM_EXCERPT_CHARS = 2000;

/**
 * Spread the prompt budget across the sample.
 *
 * A fixed per-item slice starves the case that matters most: one enormous item
 * (a whole law, a manual) got the same 3k as one item out of fifty, so the
 * analyzer only ever saw the page header — and proposed the document's own
 * table of contents back, because that is all it could see.
 */
export function excerptCharsPerItem(sampleSize: number): number {
  return Math.max(
    MIN_ITEM_EXCERPT_CHARS,
    Math.floor(ANALYSIS_BUDGET_CHARS / Math.max(1, sampleSize))
  );
}

export interface AnalysisExcerptInput {
  text: string;
  title: string;
  url?: string | null;
}

/**
 * Assemble the sampled excerpts under the prompt budget.
 *
 * The budget is charged for the whole block, header included — the earlier
 * version sliced the text to the per-item allowance and *then* rejected any
 * block that pushed past the total, which meant a sample of one always
 * overflowed by the length of its own header and was dropped. The analyzer
 * then reported, accurately and uselessly, that it had been given nothing.
 */
export function buildAnalysisExcerpts(
  items: readonly AnalysisExcerptInput[],
  perItemChars: number,
  budgetChars = ANALYSIS_BUDGET_CHARS
): string[] {
  const excerpts: string[] = [];
  let used = 0;
  for (const item of items) {
    const header = [`### ${item.title}`, item.url ? `URL: ${item.url}` : ""]
      .filter(Boolean)
      .join("\n");
    // +1 for the newline joining the header to the body.
    const room = budgetChars - used - header.length - 1;
    if (room <= 0) {
      break;
    }
    const text = item.text.trim().slice(0, Math.min(perItemChars, room));
    const block = `${header}\n${text || "(no fetched content)"}`;
    excerpts.push(block);
    used += block.length;
  }
  return excerpts;
}

export interface AnalyzeKbSourceOptions {
  hint?: string;
  sample_size?: number;
}

export interface AnalyzeKbSourceResult extends KbSourceAnalysis {
  /** How many synced items the proposal is based on. */
  sampled_items: number;
  /** How many active items the source has in total. */
  total_items: number;
}

export async function analyzeKbSource(
  repos: KbRepoFactory,
  sourceId: string,
  options: AnalyzeKbSourceOptions = {}
): Promise<AnalyzeKbSourceResult> {
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("AI Gateway is required to analyze a source.");
  }
  const source = await repos.sources.getById(sourceId);
  if (!source) {
    throw new Error("Source not found");
  }

  const page = await repos.sources.listItemsPaginated(sourceId, {
    page: 1,
    page_size: 200,
  });
  const active = page.data.filter((item) => item.status === "active");
  if (active.length === 0) {
    throw new Error(
      "This source has no synced items yet. Run Sync first, then analyze."
    );
  }

  const sampleSize = Math.min(options.sample_size ?? 12, active.length);
  const sample = evenlySpacedSample(active, sampleSize);
  const perItemChars = excerptCharsPerItem(sample.length);

  const read: AnalysisExcerptInput[] = [];
  for (const item of sample) {
    read.push({
      text: await readItemText(repos, item),
      title: item.title ?? "Untitled",
      url: item.source_url,
    });
  }
  const excerpts = buildAnalysisExcerpts(read, perItemChars);

  const { output } = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    output: Output.object({ schema: kbSourceAnalysisSchema }),
    prompt: [
      `You are planning a knowledge wiki to be built from the source "${source.name}".`,
      `The source has ${active.length} synced item(s); ${excerpts.length} are sampled below.`,
      options.hint?.trim()
        ? `\nThe user asks specifically: ${options.hint.trim()}`
        : "",
      "",
      `Work in two steps, in this order.

STEP 1 — "concepts". Extract the ideas the material establishes: the things a
reader would look up BY NAME, and what the material actually claims about each.
A concept is a term, entity, rule, mechanism, role or obligation — something
you could define. Use the material's own vocabulary for "name".

This step is not a summary and it is not an outline. Do NOT list the source's
sections, chapters, headings or numbering as concepts. "Transitional provisions
and amendment history" is a section of a document; "building class", "site
permit", "setback distance" are concepts. If your list reads like the source's
table of contents, you have done the wrong thing — go back to the text and name
what it is ABOUT.

STEP 2 — "pages". Turn the concepts into wiki pages: one page per major
concept, since a page a reader can find by name is the whole point. Group
several concepts onto one page only when they are so tightly related that
separate pages would each be a stub, and say so in the rationale. List the
concept names each page carries in "covers" — every major concept from step 1
must be covered by exactly one page. Assign each page a content-type category
(Concepts, Reference, Guides, Tutorials, Integrations, Changelog, Glossary);
expect most to be Concepts, because that is what you extracted.

Also produce:
- "overview": what this material actually is, in one or two sentences.
- "suggested_instructions": an authoring brief addressed to the agent that will
  write the wiki. State the subject, that pages are per concept, the naming
  convention, how deep to nest, that every page links to the related pages it
  mentions, and anything about this material an author would otherwise get
  wrong. Write it as instructions to follow, not as a description of them, and
  in the language the source material is written in.`,
      "",
      "---",
      "",
      excerpts.join("\n\n---\n\n"),
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return {
    ...output,
    sampled_items: excerpts.length,
    total_items: active.length,
  };
}

/**
 * Read an item's text the way ingestion does.
 *
 * Manual entries and uploaded files keep their content on the inbox item
 * rather than in sections, so reading sections alone made every such source
 * look empty. Promotion status is ignored on purpose: analysis consumes
 * nothing, and an item already turned into an article is still the best
 * evidence of what this source is about.
 */
export async function readItemText(
  repos: KbRepoFactory,
  item: { id: string; inbox_item_id?: string | null }
): Promise<string> {
  const sections = await repos.sources.listSourceItemSections(item.id);
  const fromSections = sections
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((section) => section.kind === "markdown" || section.kind === "text")
    .map((section) => section.content)
    .join("\n\n")
    .trim();
  if (fromSections) {
    return fromSections;
  }
  if (!item.inbox_item_id) {
    return "";
  }
  const inbox = await repos.inbox.getById(item.inbox_item_id).catch(() => null);
  return (inbox?.raw_markdown ?? inbox?.raw_text ?? "").trim();
}

/**
 * Sample across the whole set rather than the first N.
 *
 * A crawl is usually ordered, so the first N items are all front matter — a
 * table of contents and a preface tell you nothing about the body. Even
 * spacing gives the analyzer a view of the actual range.
 */
export function evenlySpacedSample<T>(items: T[], count: number): T[] {
  if (count >= items.length) {
    return [...items];
  }
  if (count <= 1) {
    return items.length > 0 ? [items[0] as T] : [];
  }
  const step = (items.length - 1) / (count - 1);
  const picked: T[] = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(items[Math.round(i * step)] as T);
  }
  return picked;
}
