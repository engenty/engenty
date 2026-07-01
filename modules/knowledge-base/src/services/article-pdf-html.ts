import { marked } from "marked";
import { articleToFrontmatter } from "../../ui/lib/article-frontmatter.js";
import { articleBodyAsMarkdown } from "../../ui/lib/article-markdown-export.js";
import { kbMergeArticlePropertyDefinitions } from "../schema/knowledge-bases.js";
import type { Article, KnowledgeBase } from "../schema/types.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PDF_MARKED_OPTS = { async: false as const, gfm: true };

/**
 * Minimal print stylesheet HTML for Gotenberg Chromium → PDF.
 */
export function buildArticlePdfHtml(
  article: Article,
  kb: KnowledgeBase | null
): string {
  const propertyDefinitions = kbMergeArticlePropertyDefinitions(
    kb?.article_property_definitions
  );
  const bodyMd = articleBodyAsMarkdown(article);
  const bodyHtml = marked(bodyMd, PDF_MARKED_OPTS) as string;

  const summaryBlock = article.summary?.trim()
    ? `<section class="summary"><h2>Summary</h2><p>${escapeHtml(article.summary.trim()).replace(/\n/g, "<br/>")}</p></section>`
    : "";

  const questions =
    article.questions_answered && article.questions_answered.length > 0
      ? `<section class="questions"><h2>Questions answered</h2><ul>${article.questions_answered.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul></section>`
      : "";

  const metaYaml = articleToFrontmatter(article, propertyDefinitions);
  const metaBlock = `<pre class="frontmatter">${escapeHtml(metaYaml)}</pre>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(article.title ?? "Article")}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem 2.5rem; line-height: 1.55; color: #111; }
    h1 { font-size: 1.75rem; margin-bottom: 0.75rem; }
    .meta { font-size: 0.85rem; color: #444; margin-bottom: 1.5rem; }
    .frontmatter { background: #f4f4f5; padding: 1rem; border-radius: 6px; font-size: 0.8rem; white-space: pre-wrap; margin-bottom: 1.5rem; }
    .summary, .questions { margin: 1.25rem 0; }
    .summary h2, .questions h2 { font-size: 1rem; margin-bottom: 0.5rem; }
    .content { margin-top: 1rem; }
    .content :is(h1,h2,h3,h4) { margin-top: 1.25em; margin-bottom: 0.35em; }
    .content pre { background: #f4f4f5; padding: 0.75rem 1rem; border-radius: 6px; overflow-x: auto; }
    .content code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
    .content table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    .content th, .content td { border: 1px solid #ccc; padding: 0.35rem 0.5rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(article.title ?? "")}</h1>
  <p class="meta">${escapeHtml(article.status)} · ${escapeHtml(article.slug ?? "")}</p>
  ${metaBlock}
  ${summaryBlock}
  ${questions}
  <main class="content">${bodyHtml}</main>
</body>
</html>`;
}
