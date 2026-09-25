/**
 * Knowledge Base — Zod schema tests.
 */

import { describe, expect, it } from "vitest";
import { articlePropertyDefinitionsSchema } from "../src/schema/knowledge-bases.js";
import {
  articleCreateSchema,
  articlesQuerySchema,
  articleUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  faqCreateSchema,
  faqsQuerySchema,
  kbArticlesSearchFiltersSchema,
  kbArticleTemplateCreateSchema,
  kbSettingsSchema,
  kbSourceIngestBodySchema,
  kbSourceIngestConfigSchema,
  kbSourceUpdateSchema,
  knowledgeBaseCreateSchema,
  knowledgeBaseUpdateSchema,
  tagCreateSchema,
} from "../src/schema/zod.js";

describe("knowledgeBaseCreateSchema", () => {
  it("accepts valid input", () => {
    const result = knowledgeBaseCreateSchema.safeParse({
      name: "My KB",
      slug: "my-kb",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My KB");
      expect(result.data.space_id).toBeUndefined();
    }
  });

  it("rejects missing name", () => {
    const result = knowledgeBaseCreateSchema.safeParse({ slug: "test" });
    expect(result.success).toBe(false);
  });

  it("accepts optional description", () => {
    const result = knowledgeBaseCreateSchema.safeParse({
      name: "With Desc",
      slug: "with-desc",
      description: "Some description",
    });
    expect(result.success).toBe(true);
  });
});

describe("knowledgeBaseUpdateSchema", () => {
  it("allows partial updates", () => {
    const result = knowledgeBaseUpdateSchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = knowledgeBaseUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("articlePropertyDefinitionsSchema", () => {
  it("accepts builtin + custom rows", () => {
    const result = articlePropertyDefinitionsSchema.safeParse([
      {
        id: "kb-builtin-status",
        key: "status",
        label: "",
        order: 0,
        type: "text",
        builtin_ref: "status",
        visible: true,
        show_in_compact: false,
      },
      {
        id: "c1",
        key: "my-field",
        label: "My field",
        order: 1,
        type: "text",
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects custom row without label", () => {
    const result = articlePropertyDefinitionsSchema.safeParse([
      {
        id: "c1",
        key: "my-field",
        label: "",
        order: 0,
        type: "text",
      },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate builtin_ref", () => {
    const result = articlePropertyDefinitionsSchema.safeParse([
      {
        id: "a",
        key: "status",
        label: "",
        order: 0,
        type: "text",
        builtin_ref: "status",
      },
      {
        id: "b",
        key: "status",
        label: "",
        order: 1,
        type: "text",
        builtin_ref: "status",
      },
    ]);
    expect(result.success).toBe(false);
  });
});

describe("kbArticleTemplateCreateSchema", () => {
  it("accepts property-only templates", () => {
    const result = kbArticleTemplateCreateSchema.safeParse({
      kb_id: "kb-1",
      name: "Product",
      property_definitions: [
        {
          id: "p1",
          key: "sku",
          label: "SKU",
          description: "Product stock keeping unit found in the document.",
          order: 0,
          type: "text",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content_markdown).toBeUndefined();
    }
  });

  it("ignores empty options arrays on non-select properties", () => {
    const result = kbArticleTemplateCreateSchema.safeParse({
      kb_id: "kb-1",
      name: "Product",
      property_definitions: [
        {
          id: "p1",
          key: "sku",
          label: "SKU",
          description: "",
          order: 0,
          type: "text",
          options: [],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate template property keys", () => {
    const result = kbArticleTemplateCreateSchema.safeParse({
      kb_id: "kb-1",
      name: "Product",
      property_definitions: [
        {
          id: "p1",
          key: "sku",
          label: "SKU",
          description: "",
          order: 0,
          type: "text",
        },
        {
          id: "p2",
          key: "sku",
          label: "SKU 2",
          description: "",
          order: 1,
          type: "text",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("tagCreateSchema", () => {
  it("accepts valid input", () => {
    const result = tagCreateSchema.safeParse({
      kb_id: "kb-1",
      name: "React",
      slug: "react",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid hex color", () => {
    const result = tagCreateSchema.safeParse({
      kb_id: "kb-1",
      name: "Blue",
      slug: "blue",
      color: "#3b82f6",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid color", () => {
    const result = tagCreateSchema.safeParse({
      kb_id: "kb-1",
      name: "Bad",
      slug: "bad",
      color: "red",
    });
    expect(result.success).toBe(false);
  });
});

describe("articleCreateSchema", () => {
  it("accepts minimal valid input", () => {
    const result = articleCreateSchema.safeParse({
      kb_id: "kb-1",
      title: "My Article",
      slug: "my-article",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("draft");
      expect(result.data.sort_order).toBe(0);
      expect(result.data.questions_answered).toEqual([]);
    }
  });

  it("accepts full input", () => {
    const result = articleCreateSchema.safeParse({
      kb_id: "kb-1",
      title: "Full Article",
      slug: "full-article",
      status: "published",
      summary: "A summary",
      content_json: { type: "doc", content: [] },
      content_markdown: "# Hello",
      questions_answered: ["What is this?"],
      tag_ids: ["tag-1", "tag-2"],
      sort_order: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = articleCreateSchema.safeParse({
      kb_id: "kb-1",
      title: "Test",
      slug: "test",
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("articleUpdateSchema", () => {
  it("allows partial updates", () => {
    const result = articleUpdateSchema.safeParse({
      title: "Updated Title",
      status: "published",
    });
    expect(result.success).toBe(true);
  });

  it("accepts published_at", () => {
    const result = articleUpdateSchema.safeParse({
      published_at: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("articlesQuerySchema", () => {
  it("accepts minimal query", () => {
    const result = articlesQuerySchema.safeParse({ kb_id: "kb-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.page_size).toBe(25);
      expect(result.data.sort_by).toBe("sort_order");
      expect(result.data.sort_order).toBe("asc");
    }
  });

  it("accepts full query", () => {
    const result = articlesQuerySchema.safeParse({
      kb_id: "kb-1",
      status: "published",
      search: "hello",
      page: 2,
      page_size: 50,
      sort_by: "title",
      sort_order: "desc",
      top_level_only: true,
      search_fts: true,
      parent_article_id: "art-parent",
    });
    expect(result.success).toBe(true);
  });
});

describe("faqCreateSchema", () => {
  it("accepts valid input", () => {
    const result = faqCreateSchema.safeParse({
      kb_id: "kb-1",
      question: "How do I do X?",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("draft");
    }
  });
});

describe("faqsQuerySchema", () => {
  it("accepts minimal query", () => {
    const result = faqsQuerySchema.safeParse({ kb_id: "kb-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort_by).toBe("sort_order");
      expect(result.data.sort_order).toBe("asc");
    }
  });

  it("accepts sort fields", () => {
    const result = faqsQuerySchema.safeParse({
      kb_id: "kb-1",
      sort_by: "question",
      sort_order: "desc",
    });
    expect(result.success).toBe(true);
  });
});

describe("kbArticlesSearchFiltersSchema", () => {
  it("accepts an empty filter (all fields optional)", () => {
    const result = kbArticlesSearchFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts the verifier toggle and lexical bypass", () => {
    const result = kbArticlesSearchFiltersSchema.safeParse({
      kb_id: "kb-1",
      verifier: true,
      use_vector: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.verifier).toBe(true);
      expect(result.data.use_vector).toBe(false);
    }
  });

  it("rejects out-of-range match_threshold", () => {
    const result = kbArticlesSearchFiltersSchema.safeParse({
      match_threshold: 2,
    });
    expect(result.success).toBe(false);
  });
});

describe("kbSettingsSchema", () => {
  it("accepts defaults", () => {
    const result = kbSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("embedding_model");
      expect(result.data.kb_chunking_by_id).toEqual({});
      expect(result.data.search_vector_min_similarity).toBe(0.45);
      expect(result.data.search_verifier_min_query_terms).toBe(3);
      expect(result.data.search_verifier_max_candidates).toBe(6);
      expect(result.data.sidebar_article_tree_defaults_by_kb).toEqual({});
    }
  });

  it("accepts custom settings", () => {
    const result = kbSettingsSchema.safeParse({
      kb_chunking_by_id: {
        "kb-1": { max_length: 1500, overlap: 0, strategy: "sentence" },
      },
      search_vector_min_similarity: 0.72,
      search_verifier_min_query_terms: 5,
      search_verifier_max_candidates: 4,
    });
    expect(result.success).toBe(true);
  });
});

describe("categoryCreateSchema", () => {
  it("accepts minimal input", () => {
    const result = categoryCreateSchema.safeParse({
      kb_id: "kb-1",
      name: "Guides",
      slug: "guides",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parent_id).toBeUndefined();
      expect(result.data.sort_order).toBe(0);
    }
  });

  it("accepts nested category", () => {
    const result = categoryCreateSchema.safeParse({
      kb_id: "kb-1",
      name: "Onboarding",
      slug: "onboarding",
      parent_id: "cat-product",
      sort_order: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty slug", () => {
    const result = categoryCreateSchema.safeParse({
      kb_id: "kb-1",
      name: "Guides",
      slug: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("categoryUpdateSchema", () => {
  it("allows partial updates", () => {
    const result = categoryUpdateSchema.safeParse({ name: "Renamed" });
    expect(result.success).toBe(true);
  });

  it("accepts empty patch", () => {
    expect(categoryUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("forbids changing kb_id (omitted from update schema)", () => {
    const result = categoryUpdateSchema.safeParse({ kb_id: "kb-2" });
    // kb_id is omitted from categoryUpdateSchema but unknown keys are dropped
    // by Zod's default `strip` mode — the parse still succeeds and ignores it.
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as { kb_id?: string }).kb_id).toBeUndefined();
    }
  });
});

describe("articleCreateSchema with category_id", () => {
  it("allows omitting category_id (resolved server-side)", () => {
    const result = articleCreateSchema.safeParse({
      kb_id: "kb-1",
      title: "Welcome",
      slug: "welcome",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category_id).toBeUndefined();
    }
  });

  it("accepts explicit category_id", () => {
    const result = articleCreateSchema.safeParse({
      kb_id: "kb-1",
      title: "Welcome",
      slug: "welcome",
      category_id: "cat-guides",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null category_id (resolves to default)", () => {
    const result = articleCreateSchema.safeParse({
      kb_id: "kb-1",
      title: "Welcome",
      slug: "welcome",
      category_id: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("articlesQuerySchema with category_id filter", () => {
  it("accepts category_id filter", () => {
    const result = articlesQuerySchema.safeParse({
      kb_id: "kb-1",
      category_id: "cat-guides",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category_id).toBe("cat-guides");
    }
  });
});

describe("kbSourceIngestConfigSchema", () => {
  it("accepts category_id", () => {
    const result = kbSourceIngestConfigSchema.safeParse({
      agentic_instructions: "Build topic pages and preserve citations.",
      category_id: "cat-guides",
      parent_article_id: "article-root",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentic_instructions).toBe(
        "Build topic pages and preserve citations."
      );
      expect(result.data.parent_article_id).toBe("article-root");
    }
  });

  it("accepts empty config", () => {
    expect(kbSourceIngestConfigSchema.safeParse({}).success).toBe(true);
  });
});

describe("kbSourceIngestBodySchema", () => {
  it("accepts category_id on ingest", () => {
    const result = kbSourceIngestBodySchema.safeParse({
      strategy: "per_entry",
      category_id: "cat-guides",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category_id).toBe("cat-guides");
    }
  });
});

describe("kbSourceUpdateSchema ingest_config", () => {
  it("accepts partial ingest_config patch", () => {
    const result = kbSourceUpdateSchema.safeParse({
      ingest_config: {
        agentic_instructions: "Use semantic categories.",
        category_id: "cat-guides",
        parent_article_id: "article-root",
      },
    });
    expect(result.success).toBe(true);
  });
});
