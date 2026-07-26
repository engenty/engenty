import type { KbRepoFactory } from "@engenty/knowledge-base/dal/contracts";
import type {
  Article,
  KbCategory,
  KnowledgeBase,
} from "@engenty/knowledge-base/schema/types";
import { describe, expect, it } from "vitest";
import { createOkfStore } from "../src/db/okf-store.js";
import { buildCategorySlugChains } from "../src/okf/category-tree.js";
import { parseOkf, serializeOkf } from "../src/okf/frontmatter.js";
import { exportKb } from "../src/services/export.js";
import { importKb } from "../src/services/import.js";
import { createMemoryStorage } from "./mock-storage.js";

const BASE = "t1/kb1";

function kb(): KnowledgeBase {
  return {
    id: "kb1",
    name: "Docs",
    slug: "docs",
    description: "Product docs",
    created_at: "2026-06-15T10:00:00.000Z",
    updated_at: "2026-06-15T12:00:00.000Z",
  } as unknown as KnowledgeBase;
}

function cat(id: string, slug: string, parent: string | null): KbCategory {
  return {
    id,
    kb_id: "kb1",
    parent_id: parent,
    name: slug,
    slug,
    sort_order: 0,
    view_type: "folder",
    intro_markdown: null,
    created_at: "2026-06-15T10:00:00.000Z",
    updated_at: "2026-06-15T10:00:00.000Z",
  } as unknown as KbCategory;
}

function article(id: string, slug: string, categoryId: string): Article {
  return {
    id,
    kb_id: "kb1",
    category_id: categoryId,
    title: slug,
    slug,
    status: "published",
    content_markdown: `# ${slug}\n\nBody of ${slug}.`,
    sort_order: 0,
    tags: [],
    created_at: "2026-06-15T10:05:00.000Z",
    updated_at: "2026-06-15T10:15:00.000Z",
  } as unknown as Article;
}

function mockRepos(
  categories: KbCategory[],
  articles: Article[]
): KbRepoFactory {
  return {
    kb: { getById: () => Promise.resolve(kb()) },
    categories: { list: () => Promise.resolve(categories) },
    articles: {
      listPaginated: () =>
        Promise.resolve({
          data: articles,
          page: 1,
          page_size: 100,
          total: articles.length,
        }),
    },
  } as unknown as KbRepoFactory;
}

describe("OKF frontmatter", () => {
  it("round-trips frontmatter and body", () => {
    const text = serializeOkf(
      { id: "a1", title: "Hello", tags: ["x", "y"] },
      "# Hello\n\nworld"
    );
    const parsed = parseOkf(text);
    expect(parsed.frontmatter.id).toBe("a1");
    expect(parsed.frontmatter.tags).toEqual(["x", "y"]);
    expect(parsed.body).toBe("# Hello\n\nworld");
  });

  it("tolerates files without frontmatter", () => {
    expect(parseOkf("just text").frontmatter).toEqual({});
  });
});

describe("category slug chains", () => {
  it("resolves nested parent chains", () => {
    const chains = buildCategorySlugChains([
      cat("c1", "general", null),
      cat("c2", "troubleshooting", "c1"),
    ]);
    expect(chains.get("c1")).toEqual(["general"]);
    expect(chains.get("c2")).toEqual(["general", "troubleshooting"]);
  });
});

describe("export → import full cycle", () => {
  const categories = [
    cat("c1", "general", null),
    cat("c2", "troubleshooting", "c1"),
  ];
  const articles = [
    article("a1", "reset-password", "c1"),
    article("a2", "connection-issues", "c2"),
  ];

  it("writes the expected OKF tree", async () => {
    const storage = createMemoryStorage();
    const result = await exportKb(
      { base: BASE, repos: mockRepos(categories, articles), storage },
      "kb1"
    );
    expect(result).toEqual({ kb_id: "kb1", categories: 2, articles: 2 });
    expect(storage.keys()).toEqual([
      "t1/kb1/general/index.md",
      "t1/kb1/general/reset-password.md",
      "t1/kb1/general/troubleshooting/connection-issues.md",
      "t1/kb1/general/troubleshooting/index.md",
      "t1/kb1/index.md",
    ]);
  });

  it("reconstructs every entity with preserved ids", async () => {
    const storage = createMemoryStorage();
    await exportKb(
      { base: BASE, repos: mockRepos(categories, articles), storage },
      "kb1"
    );

    const seen = {
      kb: [] as string[],
      cat: [] as string[],
      art: [] as string[],
    };
    const store = {
      upsertKb: (fm: Record<string, unknown>) => {
        seen.kb.push(String(fm.id));
        return Promise.resolve(String(fm.id));
      },
      upsertCategory: (fm: Record<string, unknown>) => {
        seen.cat.push(String(fm.id));
        return Promise.resolve(String(fm.id));
      },
      upsertArticle: (fm: Record<string, unknown>) => {
        seen.art.push(String(fm.id));
        return Promise.resolve(String(fm.id));
      },
      linkArticleTags: () => Promise.resolve(),
    };

    const result = await importKb(
      { base: BASE, storage, store: store as never },
      "kb1"
    );
    expect(result).toEqual({ kb_imported: true, categories: 2, articles: 2 });
    expect(seen.kb).toEqual(["kb1"]);
    // Parents are imported before children (shallowest path first).
    expect(seen.cat).toEqual(["c1", "c2"]);
    expect(seen.art.sort()).toEqual(["a1", "a2"]);
  });
});

describe("okf store default-category fallback", () => {
  // `module_kb.articles.category_id` is NOT NULL (FK restrict), so imports of
  // OKF files without a category must resolve the KB's seeded default.
  function fakeSupabase(defaultCategoryRow: { id: string } | null) {
    const upserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    let defaultLookups = 0;
    const from = (name: string) => ({
      upsert: (row: Record<string, unknown>) => {
        upserts.push({ table: name, row });
        return Promise.resolve({ error: null });
      },
      delete: () => ({ eq: () => Promise.resolve({}) }),
      select: () => {
        const builder = {
          eq: () => builder,
          in: () => Promise.resolve({ data: [] }),
          maybeSingle: () => {
            defaultLookups++;
            return Promise.resolve({ data: defaultCategoryRow, error: null });
          },
        };
        return builder;
      },
    });
    return {
      client: { schema: () => ({ from }) },
      upserts,
      lookups: () => defaultLookups,
    };
  }

  it("falls back to the KB default category and memoizes the lookup", async () => {
    const fake = fakeSupabase({ id: "cat-default" });
    const store = createOkfStore(fake.client, "t1", "s1");
    await store.upsertArticle({ id: "a1", kb_id: "kb1", slug: "one" }, "body");
    await store.upsertArticle({ id: "a2", kb_id: "kb1", slug: "two" }, "body");
    const articleRows = fake.upserts.filter((u) => u.table === "articles");
    expect(articleRows.map((u) => u.row.category_id)).toEqual([
      "cat-default",
      "cat-default",
    ]);
    expect(fake.lookups()).toBe(1);
  });

  it("keeps an explicit category_id without any lookup", async () => {
    const fake = fakeSupabase({ id: "cat-default" });
    const store = createOkfStore(fake.client, "t1", "s1");
    await store.upsertArticle(
      { id: "a1", kb_id: "kb1", slug: "one", category_id: "c9" },
      "body"
    );
    expect(fake.upserts.at(0)?.row.category_id).toBe("c9");
    expect(fake.lookups()).toBe(0);
  });

  it("throws a clear error when the default category is missing", async () => {
    const fake = fakeSupabase(null);
    const store = createOkfStore(fake.client, "t1", "s1");
    await expect(
      store.upsertArticle({ id: "a1", kb_id: "kb1", slug: "one" }, "body")
    ).rejects.toThrow(/No default category found for KB kb1/);
  });
});
