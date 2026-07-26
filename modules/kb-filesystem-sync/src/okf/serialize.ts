/**
 * Map Knowledge Base DB entities to OKF Markdown documents. The frontmatter
 * mirrors the shape documented in the KB Filesystem Sync plan.
 */

import type {
  Article,
  KbCategory,
  KnowledgeBase,
} from "@engenty/knowledge-base/schema/types";
import { serializeOkf } from "./frontmatter.js";

export function kbToOkf(kb: KnowledgeBase): string {
  return serializeOkf(
    {
      id: kb.id,
      name: kb.name,
      slug: kb.slug,
      description: kb.description,
      created_at: kb.created_at,
      updated_at: kb.updated_at,
    },
    kb.description ? `# ${kb.name}\n\n${kb.description}` : `# ${kb.name}`
  );
}

export function categoryToOkf(category: KbCategory): string {
  return serializeOkf(
    {
      id: category.id,
      name: category.name,
      slug: category.slug,
      kb_id: category.kb_id,
      parent_id: category.parent_id,
      sort_order: category.sort_order,
      view_type: category.view_type,
      created_at: category.created_at,
      updated_at: category.updated_at,
    },
    category.intro_markdown ?? `# ${category.name}`
  );
}

export function articleToOkf(article: Article): string {
  return serializeOkf(
    {
      id: article.id,
      title: article.title,
      slug: article.slug,
      kb_id: article.kb_id,
      category_id: article.category_id,
      status: article.status,
      sort_order: article.sort_order,
      tags: (article.tags ?? []).map((t) => t.slug),
      created_at: article.created_at,
      updated_at: article.updated_at,
    },
    article.content_markdown ?? `# ${article.title}`
  );
}
