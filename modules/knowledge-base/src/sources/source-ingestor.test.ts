import { describe, expect, it, vi } from "vitest";
import { ingestKbSource } from "./source-ingestor.js";

function baseRepos(overrides: {
  create?: ReturnType<typeof vi.fn>;
  items?: Record<string, unknown>[];
  listSourceItemSections?: ReturnType<typeof vi.fn>;
  source?: Record<string, unknown>;
}) {
  const create =
    overrides.create ??
    vi.fn(async (input: { category_id?: string | null; title?: string }) => ({
      id: `art-${input.title ?? "x"}`,
      category_id: input.category_id,
    }));

  return {
    sources: {
      getById: vi.fn(async () => ({
        id: "src-1",
        kb_id: "kb-1",
        name: "Test source",
        ingest_config: {},
        ...overrides.source,
      })),
      listItemsPaginated: vi.fn(async () => ({
        data: overrides.items ?? [],
      })),
      listSourceItemSections:
        overrides.listSourceItemSections ?? vi.fn(async () => []),
    },
    inbox: {
      getById: vi.fn<() => Promise<Record<string, unknown> | null>>(
        async () => null
      ),
      update: vi.fn(async () => ({})),
    },
    kb: { getById: vi.fn(async () => ({ id: "kb-1", slug: "test-kb" })) },
    articles: { create, update: vi.fn(async () => ({ id: "art-1" })) },
    source_references: { create: vi.fn(async () => ({ id: "ref-1" })) },
  };
}

/** Long enough to trigger the sub-page split, with two h2 chapters. */
function longChapteredMarkdown(): string {
  const filler = "x".repeat(20_000);
  return `## Chapter one\n\n${filler}\n\n## Chapter two\n\n${filler}`;
}

describe("ingestKbSource", () => {
  it("passes category_id when creating articles", async () => {
    const create = vi.fn(async (input: { category_id?: string | null }) => ({
      id: "art-1",
      category_id: input.category_id,
    }));
    const repos = baseRepos({
      create,
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: "inbox-1",
          title: "Page one",
          source_url: "https://example.com/one",
        },
      ],
    });
    repos.inbox.getById = vi.fn(async () => ({
      id: "inbox-1",
      status: "new",
      title: "Page one",
      raw_markdown: "# Hello",
      source_url: "https://example.com/one",
    }));

    await ingestKbSource(repos as never, "src-1", {
      category_id: "cat-guides",
      strategy: "per_entry",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: "cat-guides" }),
      [],
      null
    );
  });

  it("uses source ingest_config category when request omits category_id", async () => {
    const create = vi.fn(async (input: { category_id?: string | null }) => ({
      id: "art-1",
      category_id: input.category_id,
    }));
    const repos = baseRepos({
      create,
      source: { ingest_config: { category_id: "cat-default" } },
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: "inbox-1",
          title: "Page one",
          source_url: null,
        },
      ],
    });
    repos.inbox.getById = vi.fn(async () => ({
      id: "inbox-1",
      status: "new",
      title: "Page one",
      raw_markdown: "# Hello",
      source_url: null,
    }));

    await ingestKbSource(repos as never, "src-1", {
      strategy: "per_entry",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: "cat-default" }),
      [],
      null
    );
  });

  it("replaces URL-like item title with markdown H1 on ingest", async () => {
    const create = vi.fn(async (input: { title?: string }) => ({
      id: "art-1",
      title: input.title,
    }));
    const pageUrl = "https://example.com/docs/getting-started";
    const repos = baseRepos({
      create,
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: null,
          title: pageUrl,
          source_url: pageUrl,
        },
      ],
      listSourceItemSections: vi.fn(async () => [
        {
          content: "# Getting Started Guide\n\nBody text.",
          kind: "markdown",
          position: 0,
        },
      ]),
    });

    await ingestKbSource(repos as never, "src-1", {
      strategy: "per_entry",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Getting Started Guide",
      }),
      [],
      null
    );
  });

  it("ingests active items from source sections when inbox link is missing", async () => {
    const create = vi.fn(async () => ({ id: "art-1" }));
    const repos = baseRepos({
      create,
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: null,
          title: "Synced page",
          source_url: "https://example.com/page",
        },
      ],
      listSourceItemSections: vi.fn(async () => [
        {
          content: "# Synced body",
          kind: "markdown",
          position: 0,
        },
      ]),
    });

    const result = await ingestKbSource(repos as never, "src-1", {
      strategy: "per_entry",
    });

    expect(result.ingested_items).toBe(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        content_markdown: "# Synced body",
        title: "Synced page",
      }),
      [],
      null
    );
  });

  it("reassembles chunked markdown sections in order and skips provenance HTML", async () => {
    const create = vi.fn(async () => ({ id: "art-1" }));
    const repos = baseRepos({
      create,
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: null,
          title: "Large law",
          source_url: "https://example.com/law",
        },
      ],
      // Positions intentionally out of order; HTML provenance sections present.
      listSourceItemSections: vi.fn(async () => [
        {
          content: "## § 2\n\nPart two body",
          kind: "markdown",
          position: 3,
        },
        {
          content: "<html><body>raw</body></html>",
          kind: "html",
          position: 0,
        },
        {
          content: "# Law\n\n## § 1\n\nPart one body",
          kind: "markdown",
          position: 2,
        },
        {
          content: "<main>clean</main>",
          kind: "html",
          position: 1,
        },
      ]),
    });

    await ingestKbSource(repos as never, "src-1", {
      strategy: "per_entry",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        content_markdown:
          "# Law\n\n## § 1\n\nPart one body\n\n## § 2\n\nPart two body",
      }),
      [],
      null
    );
  });

  it("throws when active items exist but none have ingestable content", async () => {
    const repos = baseRepos({
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: null,
          title: "Indexed only",
          source_url: "https://example.com/page",
        },
      ],
    });

    await expect(
      ingestKbSource(repos as never, "src-1", {
        strategy: "per_entry",
      })
    ).rejects.toThrow(/indexed but content was not fetched/i);
  });

  it("skips items whose inbox was already promoted", async () => {
    const create = vi.fn(async () => ({ id: "art-1" }));
    const repos = baseRepos({
      create,
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: "inbox-1",
          title: "Already ingested",
          source_url: null,
        },
      ],
    });
    repos.inbox.getById = vi.fn(async () => ({
      id: "inbox-1",
      status: "promoted",
      title: "Already ingested",
      raw_markdown: "# Old",
      source_url: null,
    }));

    await expect(
      ingestKbSource(repos as never, "src-1", {
        strategy: "per_entry",
      })
    ).rejects.toThrow(/already ingested/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not attach the original unless asked to", async () => {
    const create = vi.fn(async () => ({ id: "art-1" }));
    const repos = baseRepos({
      create,
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: "inbox-1",
          title: "Page one",
          source_url: "https://example.com/one",
        },
      ],
    });
    repos.inbox.getById = vi.fn(async () => ({
      id: "inbox-1",
      status: "new",
      title: "Page one",
      raw_markdown: "# Hello",
      source_url: "https://example.com/one",
    }));

    await ingestKbSource(repos as never, "src-1", { strategy: "per_entry" });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        original_document_name: null,
        original_document_url: null,
      }),
      [],
      null
    );
  });

  it("attaches the vault object in preference to the source URL", async () => {
    const create = vi.fn(async () => ({ id: "art-1" }));
    const repos = baseRepos({
      create,
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: "inbox-1",
          title: "Bauordnung.pdf",
          source_url: "https://example.com/one",
        },
      ],
    });
    repos.inbox.getById = vi.fn(async () => ({
      id: "inbox-1",
      status: "new",
      title: "Bauordnung.pdf",
      original_storage_path: "kb/tenant/bauordnung.pdf",
      raw_markdown: "# Hello",
      source_url: "https://example.com/one",
    }));

    await ingestKbSource(repos as never, "src-1", {
      attach_original: true,
      strategy: "per_entry",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        original_document_name: "Bauordnung.pdf",
        original_document_url: "kb/tenant/bauordnung.pdf",
      }),
      [],
      null
    );
  });

  it("records provenance for every ingested entry", async () => {
    const repos = baseRepos({
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: "inbox-1",
          title: "Page one",
          source_url: "https://example.com/one",
        },
      ],
    });
    repos.inbox.getById = vi.fn(async () => ({
      id: "inbox-1",
      status: "new",
      title: "Page one",
      raw_markdown: "# Hello",
      source_url: "https://example.com/one",
    }));

    await ingestKbSource(repos as never, "src-1", { strategy: "per_entry" });

    expect(repos.source_references.create).toHaveBeenCalledWith(
      expect.objectContaining({
        inbox_item_id: "inbox-1",
        source_url: "https://example.com/one",
      })
    );
  });

  it("splits a long entry into sub-pages below an index article", async () => {
    const created: { parent_article_id?: string | null; title?: string }[] = [];
    const create = vi.fn(
      async (input: { parent_article_id?: string | null; title?: string }) => {
        created.push(input);
        return { id: `art-${created.length}` };
      }
    );
    const repos = baseRepos({
      create,
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: null,
          title: "Large law",
          source_url: "https://example.com/law",
        },
      ],
      listSourceItemSections: vi.fn(async () => [
        { content: longChapteredMarkdown(), kind: "markdown", position: 0 },
      ]),
    });

    const result = await ingestKbSource(repos as never, "src-1", {
      split_long_articles: true,
      strategy: "per_entry",
    });

    expect(created.map((input) => input.title)).toEqual([
      "Large law",
      "Chapter one",
      "Chapter two",
    ]);
    // The index page carries the contents list, not the chapter bodies.
    expect(created[0]).toEqual(
      expect.objectContaining({
        content_markdown: "## Contents\n\n1. Chapter one\n2. Chapter two",
      })
    );
    expect(created[1]?.parent_article_id).toBe("art-1");
    expect(created[2]?.parent_article_id).toBe("art-1");
    expect(result.article_ids).toEqual(["art-1", "art-2", "art-3"]);
    // Second pass: the contents list now links to the sub-pages it names.
    expect(repos.articles.update).toHaveBeenCalledWith(
      "art-1",
      {
        content_markdown:
          "## Contents\n\n1. [Chapter one](/mdl/knowledge-base/art-2)\n2. [Chapter two](/mdl/knowledge-base/art-3)",
      },
      undefined,
      null
    );
  });

  it("keeps a long entry whole when splitting is off", async () => {
    const create = vi.fn(async () => ({ id: "art-1" }));
    const repos = baseRepos({
      create,
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: null,
          title: "Large law",
          source_url: "https://example.com/law",
        },
      ],
      listSourceItemSections: vi.fn(async () => [
        { content: longChapteredMarkdown(), kind: "markdown", position: 0 },
      ]),
    });

    await ingestKbSource(repos as never, "src-1", { strategy: "per_entry" });

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("makes each entry a sub-page of the source article when merging and splitting", async () => {
    const created: { parent_article_id?: string | null; title?: string }[] = [];
    const create = vi.fn(
      async (input: { parent_article_id?: string | null; title?: string }) => {
        created.push(input);
        return { id: `art-${created.length}` };
      }
    );
    const repos = baseRepos({
      create,
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: null,
          title: "Page one",
          source_url: "https://example.com/one",
        },
        {
          id: "item-2",
          status: "active",
          inbox_item_id: null,
          title: "Page two",
          source_url: "https://example.com/two",
        },
      ],
      listSourceItemSections: vi.fn(async () => [
        { content: "Body text", kind: "markdown", position: 0 },
      ]),
    });

    await ingestKbSource(repos as never, "src-1", {
      split_long_articles: true,
      strategy: "per_source",
    });

    expect(created.map((input) => input.title)).toEqual([
      "Test source",
      "Page one",
      "Page two",
    ]);
    expect(created[1]?.parent_article_id).toBe("art-1");
  });

  it("respects an explicit false over the source's stored default", async () => {
    const create = vi.fn(async () => ({ id: "art-1" }));
    const repos = baseRepos({
      create,
      source: { ingest_config: { attach_original: true } },
      items: [
        {
          id: "item-1",
          status: "active",
          inbox_item_id: null,
          title: "Page one",
          source_url: "https://example.com/one",
        },
      ],
      listSourceItemSections: vi.fn(async () => [
        { content: "Body text", kind: "markdown", position: 0 },
      ]),
    });

    await ingestKbSource(repos as never, "src-1", {
      attach_original: false,
      strategy: "per_entry",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ original_document_url: null }),
      [],
      null
    );
  });
});
