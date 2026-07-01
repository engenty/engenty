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
      getById: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    articles: { create },
  };
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
      strategy: "articles",
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
      strategy: "articles",
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
      strategy: "articles",
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
      strategy: "articles",
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
        strategy: "articles",
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
        strategy: "articles",
      })
    ).rejects.toThrow(/already ingested/i);
    expect(create).not.toHaveBeenCalled();
  });
});
