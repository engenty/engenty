import type {
  Article,
  ArticlePropertyDefinition,
} from "../../src/schema/types.js";

function yamlScalar(v: string | number | null | undefined): string {
  if (v === null || v === undefined) {
    return "~";
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? String(v) : "~";
  }
  if (v === "") {
    return '""';
  }
  if (/^[\w.-]+$/.test(v) && !/^\d/.test(v)) {
    return v;
  }
  const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function yamlList(items: string[]): string {
  if (items.length === 0) {
    return "[]";
  }
  return `[${items.map((s) => yamlScalar(s)).join(", ")}]`;
}

/**
 * Flat YAML frontmatter for export / agent context (no nested maps).
 */
export function articleToFrontmatter(
  article: Article,
  propertyDefs: ArticlePropertyDefinition[]
): string {
  const tags = (article.tags ?? []).map((t) => t.name);

  const lines: string[] = ["---"];
  lines.push(`title: ${yamlScalar(article.title)}`);
  lines.push(`slug: ${yamlScalar(article.slug)}`);
  lines.push(`status: ${yamlScalar(article.status)}`);
  lines.push(`tags: ${yamlList(tags)}`);
  lines.push(`parent: ${yamlScalar(article.parent_article_slug ?? null)}`);
  lines.push(`created_at: ${yamlScalar(article.created_at)}`);
  lines.push(`created_by: ${yamlScalar(article.created_by)}`);
  lines.push(`updated_at: ${yamlScalar(article.updated_at)}`);
  lines.push(`updated_by: ${yamlScalar(article.updated_by)}`);

  const sorted = [...propertyDefs]
    .filter((d) => !d.builtin_ref)
    .sort((a, b) => a.order - b.order);
  const props = article.custom_properties ?? {};
  for (const def of sorted) {
    const v = props[def.key];
    lines.push(
      `${def.key}: ${yamlScalar(v as string | number | null | undefined)}`
    );
  }

  lines.push("---");
  return `${lines.join("\n")}\n`;
}
