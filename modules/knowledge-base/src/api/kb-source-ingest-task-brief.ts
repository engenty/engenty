/**
 * Build a self-contained ingestion brief for the KB manager task so an agent
 * picking it up cold has the source id, KB id, target placement, a clear
 * directive, and the user's instructions — without needing this request's
 * context.
 *
 * The brief MUST name only real gateway operation ids (kb_source_items_list,
 * kb_article_create, …). The in-process agentic fallback in
 * src/sources/source-ingest-agentic.ts has its own closure tools
 * (kb_list_items, kb_create_article, …) — those names do NOT exist for a
 * task-dispatched agent and must never appear here.
 */
export function buildIngestTaskBrief(input: {
  sourceName: string;
  sourceId: string;
  kbName: string | null;
  kbId: string;
  kbSlug: string | null;
  categoryId: string | null;
  parentArticleId: string | null;
  instructions: string;
}): string {
  const kbLabel = input.kbName
    ? `${input.kbName} (\`${input.kbId}\`)`
    : `\`${input.kbId}\``;
  return [
    "## KB Source Ingestion Brief",
    "",
    `**Goal:** Turn the indexed items of source **${input.sourceName}** into structured, internally-linked draft articles in the **${input.kbName ?? "target"}** knowledge base.`,
    "",
    "**Target:**",
    `- Source: ${input.sourceName} — \`source_id: ${input.sourceId}\``,
    `- Knowledge base: ${kbLabel}${input.kbSlug ? ` — slug: \`${input.kbSlug}\`` : ""}`,
    `- Default category: ${input.categoryId ? `\`${input.categoryId}\`` : "(KB default)"}`,
    `- Parent article: ${input.parentArticleId ? `\`${input.parentArticleId}\`` : "(none — root level)"}`,
    "",
    "**How to execute (4 passes, using the KB gateway operations):**",
    "1. **Survey** — list ALL source items with `kb_source_items_list` (paginate until exhausted), classify each by content type (concept / reference / guide / tutorial / integration / changelog / glossary), filter garbage (< 100 useful words, login/404/nav pages). If the item count is implausibly low for the goal (e.g. 1 item for a whole law or site), STOP and report the source as misconfigured instead of writing articles from your own knowledge.",
    '2. **Categorise** — check existing categories with `kb_categories_list`, then create a flat KB category via `kb_category_create` for each content type that has ≥ 1 article (e.g. "Concepts", "Reference", "Guides").',
    "3. **Create / update** — for each non-skipped item: read its captured content (each item row carries an `inbox_item_id` — use `kb_inbox_get`; fall back to fetching the item's source URL), synthesize into wiki-style prose (lead paragraph + H2 sections — do not copy source verbatim), deduplicate by source URL/title via `knowledge_base_article_search` or `kb_articles_list`, then save as draft with `kb_article_create` (or `kb_article_update` for an existing match), filed in its content-type category.",
    "4. **Cross-link** — after all articles exist, add `[Title](article-id)` links between articles that reference each other via `kb_article_update`; populate each article's `## See also` section.",
    "",
    "Ground every article in the source items — never in your own prior knowledge of the topic.",
    "",
    "---",
    "",
    "### User instructions",
    input.instructions,
  ].join("\n");
}
