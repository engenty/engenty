import { describe, expect, it } from "vitest";
import type {
  Article,
  ArticlePropertyDefinition,
} from "../../src/schema/types.js";
import { articleToFrontmatter } from "../lib/article-frontmatter.js";

const baseArticle = {
  id: "a1",
  tenant_id: "t1",
  scope_id: "s1",
  kb_id: "k1",
  parent_article_id: null,
  locked_at: null,
  title: "Hello",
  slug: "hello",
  status: "published" as const,
  content_json: null,
  content_markdown: null,
  summary: null,
  questions_answered: [],
  original_document_url: null,
  original_document_name: null,
  created_by: "u1",
  updated_by: "u1",
  sort_order: 0,
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: "2026-01-02T11:00:00.000Z",
  published_at: "2026-01-01T12:00:00.000Z",
  deleted_at: null,
  custom_properties: { priority: "high" },
  tags: [
    {
      id: "t1",
      name: "alpha",
      slug: "alpha",
      color: null,
      kb_id: "k1",
      tenant_id: "t1",
      scope_id: "s1",
      created_at: "",
    },
  ],
} as unknown as Article;

describe("articleToFrontmatter", () => {
  it("emits flat keys and custom properties in definition order", () => {
    const defs: ArticlePropertyDefinition[] = [
      {
        id: "1",
        key: "priority",
        label: "Priority",
        type: "text",
        order: 1,
      },
      {
        id: "2",
        key: "count",
        label: "Count",
        type: "number",
        order: 0,
      },
    ];
    const yaml = articleToFrontmatter(baseArticle, defs);
    expect(yaml).toContain("title:");
    expect(yaml).toContain("slug:");
    expect(yaml).toContain("count:");
    expect(yaml).toContain("priority: high");
    const countIdx = yaml.indexOf("count:");
    const priorityIdx = yaml.indexOf("priority:");
    expect(countIdx).toBeLessThan(priorityIdx);
  });
});
