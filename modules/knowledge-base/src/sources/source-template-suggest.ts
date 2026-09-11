/**
 * "Suggest a template" — the answer to a blank template picker.
 *
 * Choosing a template before you have read the crawl is the same problem the
 * structure analyzer solves for the agentic brief, one level down: the useful
 * template is the shape the entries already share, and only the entries know
 * what that is. This reads a sample and proposes a section skeleton plus the
 * typed fields those entries repeat.
 *
 * It writes nothing. The user creates the template from the proposal, or does
 * not.
 */

import {
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
} from "@engenty/ai-core";
import { generateText, Output } from "ai";
import type { KbRepoFactory } from "../dal/contracts.js";
import {
  type KbSourceTemplateSuggestion,
  kbSourceTemplateSuggestionSchema,
} from "../schema/sources.js";
import {
  type AnalysisExcerptInput,
  buildAnalysisExcerpts,
  evenlySpacedSample,
  excerptCharsPerItem,
  readItemText,
} from "./source-analyze.js";

export interface SuggestKbSourceTemplateOptions {
  hint?: string;
  sample_size?: number;
}

export interface SuggestKbSourceTemplateResult
  extends KbSourceTemplateSuggestion {
  sampled_items: number;
  total_items: number;
}

const DEFAULT_SAMPLE_SIZE = 6;

export async function suggestKbSourceTemplate(
  repos: KbRepoFactory,
  sourceId: string,
  options: SuggestKbSourceTemplateOptions = {}
): Promise<SuggestKbSourceTemplateResult> {
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("AI Gateway is required to suggest a template.");
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
      "This source has no synced items yet. Run Sync first, then suggest a template."
    );
  }

  const sampleSize = Math.min(
    options.sample_size ?? DEFAULT_SAMPLE_SIZE,
    active.length
  );
  const sample = evenlySpacedSample(active, sampleSize);
  const read: AnalysisExcerptInput[] = [];
  for (const item of sample) {
    read.push({
      text: await readItemText(repos, item),
      title: item.title ?? "Untitled",
      url: item.source_url,
    });
  }
  const excerpts = buildAnalysisExcerpts(
    read,
    excerptCharsPerItem(sample.length)
  );

  const { output } = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    output: Output.object({ schema: kbSourceTemplateSuggestionSchema }),
    prompt: [
      `You are designing one article template for the knowledge-base source "${source.name}".`,
      `Every entry from this source will be filed against it; ${excerpts.length} of the source's ${active.length} entries are sampled below.`,
      options.hint?.trim()
        ? `\nThe user asks specifically: ${options.hint.trim()}`
        : "",
      "",
      `A template has two parts.

"content_markdown" is the section skeleton every article gets. Use H2 headings
only, in the order a reader wants them, and leave each section EMPTY — the
skeleton is filled per article at ingest time. Include a section only if most
of the sampled entries actually have something to put in it. Four to seven
sections is usually right; a skeleton nobody can fill is worse than no
template.

"properties" are the typed facts these entries repeat and that a reader would
filter or sort by — a date, a reference number, a status, a responsible body.
Propose one per fact, with the type that fits: text, number, date, url, or
select. Use "select" only when the sampled entries show a small closed set of
values, and then list those values in "options". Zero properties is a valid
answer if the entries share no repeating facts. Do not propose a property for
something that is different in every entry and never looked up, such as the
body text or the title.

Write "name", "description", the headings and the property labels in the
language of the source material, not in English, unless the material is
English. Base everything on what the samples show: if the entries do not
share a shape, say so in "rationale" and propose the smallest honest
template rather than inventing structure.

"rationale" is one or two sentences on what shape you found and what you left
out.`,
      "",
      "---",
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
