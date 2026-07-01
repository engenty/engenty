/**
 * Build a self-contained ingestion brief for the Research Assistant task so an
 * agent picking it up cold has the source id, KB id, target placement, a clear
 * directive, and the user's instructions — without needing this request's
 * context.
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
    "## Knowledge Research Assistant — Ingestion Brief",
    "",
    `**Goal:** Turn the indexed items of source **${input.sourceName}** into structured, internally-linked draft articles in the **${input.kbName ?? "target"}** knowledge base.`,
    "",
    "**Target:**",
    `- Source: ${input.sourceName} — \`source_id: ${input.sourceId}\``,
    `- Knowledge base: ${kbLabel}${input.kbSlug ? ` — slug: \`${input.kbSlug}\`` : ""}`,
    `- Default category: ${input.categoryId ? `\`${input.categoryId}\`` : "(KB default)"}`,
    `- Parent article: ${input.parentArticleId ? `\`${input.parentArticleId}\`` : "(none — root level)"}`,
    "",
    "**How to execute (3 passes):**",
    "1. **Survey** — list all source items, classify each by content type (concept / reference / guide / tutorial / integration / changelog / glossary), filter garbage (< 100 useful words, login/404/nav pages).",
    '2. **Categorise** — create a flat KB category for each content type that has ≥ 1 article (e.g. "Concepts", "Reference", "Guides"). Check existing categories first.',
    "3. **Create / update** — for each non-skipped item: fetch full content, synthesize into wiki-style prose (lead paragraph + H2 sections — do not copy source verbatim), deduplicate by source URL, assign to its content-type category, save as draft.",
    "4. **Cross-link** — after all articles exist, add `[Title](article-id)` links between articles that reference each other; populate each article's `## See also` section.",
    "",
    "---",
    "",
    "### User instructions",
    input.instructions,
  ].join("\n");
}
