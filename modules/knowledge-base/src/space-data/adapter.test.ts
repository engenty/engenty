import { parseFrontmatter } from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  articleBody,
  createKnowledgeBaseSpaceDataAdapter,
  locateSpaceDataPath,
  nestArticles,
  renderArticleFile,
} from "./adapter.js";

const KB_ID = "kb-1";
const KB_SEGMENT = "handbook__kb-1";
const CAT_SEGMENT = "guides__cat-1";

function base(overrides: Record<string, unknown> = {}) {
  return {
    description: "Everything the team needs",
    id: KB_ID,
    name: "Handbook",
    slug: "handbook",
    ...overrides,
  };
}

function category(overrides: Record<string, unknown> = {}) {
  return {
    description: null,
    id: "cat-1",
    is_default: true,
    kb_id: KB_ID,
    name: "Guides",
    parent_id: null,
    sort_order: 0,
    ...overrides,
  };
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    category_id: "cat-1",
    id: "art-1",
    parent_article_id: null,
    slug: "onboarding",
    status: "published",
    summary: null,
    title: "Onboarding",
    updated_at: "2026-08-15T09:00:00.000Z",
    ...overrides,
  };
}

function article(overrides: Record<string, unknown> = {}) {
  return {
    ...summary(),
    content_json: null,
    content_markdown: "Welcome aboard.",
    created_at: "2026-08-01T00:00:00.000Z",
    kb_id: KB_ID,
    locked_at: null,
    ...overrides,
  };
}

/**
 * A context whose operations answer from fixtures.
 *
 * Every call is recorded, because "which operation did the adapter reach for"
 * is half of what these tests are checking: an adapter that read the database
 * directly would pass every assertion about its output and still be wrong.
 */
function ctx(handlers: Record<string, (input: any) => unknown>) {
  const calls: Array<{ input: any; op: string }> = [];
  return {
    calls,
    invokeOperation: vi.fn(async (op: string, input?: unknown) => {
      calls.push({ input, op });
      const handler = handlers[op];
      if (!handler) {
        throw new Error(`unexpected operation ${op}`);
      }
      return handler(input);
    }),
    recordScope: "all" as const,
    spaceId: "space-1",
    tenantId: "tenant-1",
  };
}

function defaultHandlers(rows = [summary()]) {
  return {
    kb_article_get: ({ article_id }: { article_id: string }) => ({
      article: article({ id: article_id }),
    }),
    kb_articles_list: () => ({ articles: rows, total: rows.length }),
    kb_categories_list: () => ({ categories: [category()], total: 1 }),
    kb_list: () => ({ knowledge_bases: [base()], total: 1 }),
  };
}

describe("what a path names", () => {
  it("reads a base, a category, an article and an article folder apart", () => {
    expect(locateSpaceDataPath("")).toEqual({ kind: "root" });
    expect(locateSpaceDataPath(KB_SEGMENT)).toEqual({
      kbId: KB_ID,
      kind: "base",
    });
    expect(locateSpaceDataPath(`${KB_SEGMENT}/${CAT_SEGMENT}`)).toEqual({
      categoryId: "cat-1",
      kbId: KB_ID,
      kind: "category",
    });
    expect(
      locateSpaceDataPath(
        `${KB_SEGMENT}/${CAT_SEGMENT}/setup__art-1.article.md`
      )
    ).toEqual({ articleId: "art-1", kind: "article" });
    expect(
      locateSpaceDataPath(`${KB_SEGMENT}/${CAT_SEGMENT}/setup__art-1.article`)
    ).toEqual({ articleId: "art-1", kbId: KB_ID, kind: "articleFolder" });
  });

  it("takes a parent article's id from its FOLDER, not from index.article.md", () => {
    // `index.article.md` carries no id of its own — the name is the same in
    // every article folder, so the id has to come from the segment above it.
    expect(
      locateSpaceDataPath(
        `${KB_SEGMENT}/${CAT_SEGMENT}/setup__art-9.article/index.article.md`
      )
    ).toEqual({ articleId: "art-9", kind: "article" });
  });

  it("refuses a path that tries to climb out of the tree", () => {
    expect(() => locateSpaceDataPath(`${KB_SEGMENT}/../../etc`)).toThrow();
  });
});

describe("how a category's articles nest", () => {
  it("puts a child under its parent and leaves the parent at the top", () => {
    const parent = summary({ id: "p" });
    const child = summary({ id: "c", parent_article_id: "p" });
    const { childrenOf, topLevel } = nestArticles([parent, child]);
    expect(topLevel.map((row) => row.id)).toEqual(["p"]);
    expect(childrenOf.get("p")?.map((row) => row.id)).toEqual(["c"]);
  });

  it("keeps a child whose parent is in another category at the top of its own", () => {
    // The knowledge base's own sidebar does exactly this. An article has ONE
    // home, and a parent that is not in this bucket is not here to nest under.
    const orphan = summary({ id: "c", parent_article_id: "elsewhere" });
    const { topLevel } = nestArticles([orphan]);
    expect(topLevel.map((row) => row.id)).toEqual(["c"]);
  });

  it("does not lose a cycle — it shows both pages instead of neither", () => {
    const a = summary({ id: "a", parent_article_id: "b" });
    const b = summary({ id: "b", parent_article_id: "a" });
    const { topLevel } = nestArticles([a, b]);
    expect(topLevel.map((row) => row.id).sort()).toEqual(["a", "b"]);
  });
});

describe("the file an article renders as", () => {
  it("leads with the id and carries the body below the frontmatter", () => {
    const parsed = parseFrontmatter(renderArticleFile(article() as never));
    expect(parsed.frontmatter.id).toBe("art-1");
    expect(parsed.frontmatter.title).toBe("Onboarding");
    expect(parsed.frontmatter.status).toBe("published");
    expect(parsed.body).toBe("Welcome aboard.");
  });

  it("says where the body is when the text lives in editor blocks", () => {
    // An empty body would read as "this article is empty", which is a lie
    // about the one thing the file exists to carry.
    const blocks = article({
      content_json: { content: [], type: "doc" },
      content_markdown: null,
    });
    expect(articleBody(blocks as never)).toContain("editor blocks");
  });
});

describe("listing the tree", () => {
  it("lists pages at the root, not a library or a General folder", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx(defaultHandlers());
    const listing = await adapter.list(context as never, "");
    expect(listing.folders).toEqual([]);
    expect(listing.entries).toEqual([
      {
        kind: "record",
        name: "onboarding__art-1.article.md",
        nodeType: "kb.article",
        path: `${KB_SEGMENT}/${CAT_SEGMENT}/onboarding__art-1.article.md`,
        recordId: "art-1",
        title: "Onboarding",
        updatedAt: "2026-08-15T09:00:00.000Z",
        version: "2026-08-15T09:00:00.000Z",
      },
    ]);
    expect(context.calls[0]).toEqual({
      input: { space_id: "space-1" },
      op: "kb_list",
    });
  });

  it("keeps a user-made folder at the root next to loose pages", async () => {
    const notes = category({
      id: "cat-notes",
      is_default: false,
      name: "Notes",
      parent_id: null,
    });
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx({
      ...defaultHandlers(),
      kb_categories_list: () => ({
        categories: [category(), notes],
        total: 2,
      }),
    });
    const listing = await adapter.list(context as never, "");
    expect(listing.folders.map((folder) => folder.name)).toEqual(["Notes"]);
    expect(listing.folders[0]?.path).toBe(`${KB_SEGMENT}/notes__cat-notes`);
    expect(listing.entries.map((entry) => entry.title)).toEqual(["Onboarding"]);
  });

  it("hides General when listing a library, the same way", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const listing = await adapter.list(
      ctx(defaultHandlers()) as never,
      KB_SEGMENT
    );
    expect(listing.folders).toEqual([]);
    expect(listing.entries.map((entry) => entry.title)).toEqual(["Onboarding"]);
    expect(listing.self?.nodeType).toBe("kb.base");
  });

  it("shows a parent article as a FOLDER and a childless one as a file", async () => {
    const parent = summary({ id: "p", title: "Setup" });
    const child = summary({
      id: "c",
      parent_article_id: "p",
      title: "Step one",
    });
    const leaf = summary({ id: "l", title: "Onboarding" });
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx(defaultHandlers([parent, child, leaf]));

    const listing = await adapter.list(
      context as never,
      `${KB_SEGMENT}/${CAT_SEGMENT}`
    );

    expect(listing.folders.map((folder) => folder.path)).toEqual([
      `${KB_SEGMENT}/${CAT_SEGMENT}/setup__p.article`,
    ]);
    expect(listing.entries.map((entry) => entry.path)).toEqual([
      `${KB_SEGMENT}/${CAT_SEGMENT}/onboarding__l.article.md`,
    ]);
    expect(listing.self?.nodeType).toBe("kb.category");
  });

  it("lists a parent article's own text beside its sub-pages", async () => {
    const parent = summary({ id: "p", title: "Setup" });
    const child = summary({
      id: "c",
      parent_article_id: "p",
      title: "Step one",
    });
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx({
      ...defaultHandlers([parent, child]),
      kb_article_get: () => ({ article: article({ id: "p", title: "Setup" }) }),
    });

    const path = `${KB_SEGMENT}/${CAT_SEGMENT}/setup__p.article`;
    const listing = await adapter.list(context as never, path);

    // index.article.md first: an agent listing this folder must find the page,
    // not only the pages under it.
    expect(listing.entries.map((entry) => entry.name)).toEqual([
      "index.article.md",
      "step-one__c.article.md",
    ]);
    expect(listing.self?.nodeType).toBe("kb.article");
  });

  it("says so when a category held more articles than one page", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx({
      ...defaultHandlers(),
      kb_articles_list: () => ({ articles: [summary()], total: 900 }),
    });
    const listing = await adapter.list(
      context as never,
      `${KB_SEGMENT}/${CAT_SEGMENT}`
    );
    expect(listing.truncated).toBe(true);
  });

  it("refuses to list an article FILE", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    await expect(
      adapter.list(
        ctx(defaultHandlers()) as never,
        `${KB_SEGMENT}/${CAT_SEGMENT}/onboarding__art-1.article.md`
      )
    ).rejects.toThrow(/read rather than listed/);
  });
});

describe("reading an article", () => {
  it("returns the file, keyed by the path the caller asked for", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const path = `${KB_SEGMENT}/${CAT_SEGMENT}/onboarding__art-1.article.md`;
    const document = await adapter.read(ctx(defaultHandlers()) as never, path);
    expect(document.recordId).toBe("art-1");
    expect(document.path).toBe(path);
    expect(document.version).toBe("2026-08-15T09:00:00.000Z");
    expect(document.members[0]?.content).toContain("Welcome aboard.");
  });

  it("refuses an article belonging to another space's library", async () => {
    // The article operations are tenant-scoped, not space-scoped, so an id
    // typed into a path could otherwise pull a page out of a library this
    // space does not own.
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx({
      ...defaultHandlers(),
      kb_article_get: () => ({
        article: article({ kb_id: "kb-somewhere-else" }),
      }),
    });
    await expect(
      adapter.read(
        context as never,
        `${KB_SEGMENT}/${CAT_SEGMENT}/onboarding__art-1.article.md`
      )
    ).rejects.toThrow(/belonging to this space/);
  });

  it("refuses to read a folder", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    await expect(
      adapter.read(ctx(defaultHandlers()) as never, KB_SEGMENT)
    ).rejects.toThrow(/listed rather than read/);
  });
});

describe("writing an article", () => {
  const path = `${KB_SEGMENT}/${CAT_SEGMENT}/onboarding__art-1.article.md`;

  function edited(frontmatter: string, body: string): string {
    return `---\n${frontmatter}\n---\n\n${body}\n`;
  }

  it("sends only the fields the file actually changed", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx({
      ...defaultHandlers(),
      kb_article_update: () => ({ article: article() }),
    });

    await adapter.write?.(context as never, {
      baseVersion: "2026-08-15T09:00:00.000Z",
      content: edited(
        'id: art-1\ntitle: Onboarding, revised\nslug: onboarding\nstatus: published\ncategory_id: cat-1\nkb_id: kb-1\nupdated_at: "2026-08-15T09:00:00.000Z"',
        "Welcome aboard."
      ),
      path,
    });

    const update = context.calls.find(
      (call) => call.op === "kb_article_update"
    );
    expect(update?.input.patch).toEqual({ title: "Onboarding, revised" });
  });

  it("refuses a stale write with a conflict rather than overwriting", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    await expect(
      adapter.write?.(ctx(defaultHandlers()) as never, {
        baseVersion: "2020-01-01T00:00:00.000Z",
        content: edited("id: art-1\ntitle: Whatever", "Body"),
        path,
      })
    ).rejects.toThrow(/changed since you opened it/);
  });

  it("refuses a body edit when the blocks are what the reader sees", async () => {
    // The whole reason the body is guarded: `content_json` wins on read, so
    // saving markdown beside it would succeed and change nothing on screen.
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx({
      ...defaultHandlers(),
      kb_article_get: () => ({
        article: article({
          content_json: { content: [], type: "doc" },
          content_markdown: null,
        }),
      }),
    });
    await expect(
      adapter.write?.(context as never, {
        baseVersion: "2026-08-15T09:00:00.000Z",
        content: edited("id: art-1\ntitle: Onboarding", "My new text"),
        path,
      })
    ).rejects.toThrow(/stored as editor blocks/);
  });

  it("accepts a body edit on an article that has no blocks", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx({
      ...defaultHandlers(),
      kb_article_update: () => ({ article: article() }),
    });

    await adapter.write?.(context as never, {
      baseVersion: "2026-08-15T09:00:00.000Z",
      content: edited("id: art-1\ntitle: Onboarding", "Rewritten."),
      path,
    });

    const update = context.calls.find(
      (call) => call.op === "kb_article_update"
    );
    expect(update?.input.patch).toEqual({ content_markdown: "Rewritten." });
  });

  it("refuses to move an article to another knowledge base", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    await expect(
      adapter.write?.(ctx(defaultHandlers()) as never, {
        baseVersion: "2026-08-15T09:00:00.000Z",
        content: edited(
          "id: art-1\ntitle: Onboarding\nkb_id: kb-other",
          "Welcome aboard."
        ),
        path,
      })
    ).rejects.toThrow(/another knowledge base/);
  });

  it("refuses a field the article schema does not have", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    await expect(
      adapter.write?.(ctx(defaultHandlers()) as never, {
        baseVersion: "2026-08-15T09:00:00.000Z",
        content: edited("id: art-1\nauthor: Someone", "Welcome aboard."),
        path,
      })
    ).rejects.toThrow(/not a field of a knowledge article/);
  });

  it("refuses to edit a locked article", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx({
      ...defaultHandlers(),
      kb_article_get: () => ({
        article: article({ locked_at: "2026-08-10T00:00:00.000Z" }),
      }),
    });
    await expect(
      adapter.write?.(context as never, {
        baseVersion: "2026-08-15T09:00:00.000Z",
        content: edited("id: art-1\ntitle: New", "Welcome aboard."),
        path,
      })
    ).rejects.toThrow(/locked/);
  });

  it("reports the NEW path when an edit moved the article", async () => {
    const moved = article({ category_id: "cat-2" });
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    let updated = false;
    const context = ctx({
      kb_article_get: () =>
        updated ? { article: moved } : { article: article() },
      kb_article_update: () => {
        updated = true;
        return { article: moved };
      },
      kb_articles_list: () => ({ articles: [summary()], total: 1 }),
      kb_categories_list: () => ({
        categories: [category(), category({ id: "cat-2", name: "Reference" })],
        total: 2,
      }),
      kb_list: () => ({ knowledge_bases: [base()], total: 1 }),
    });

    const document = await adapter.write?.(context as never, {
      baseVersion: "2026-08-15T09:00:00.000Z",
      content: edited(
        "id: art-1\ntitle: Onboarding\ncategory_id: cat-2",
        "Welcome aboard."
      ),
      path,
    });

    expect(document?.path).toBe(
      `${KB_SEGMENT}/reference__cat-2/onboarding__art-1.article.md`
    );
  });
});

describe("creating a folder or a page", () => {
  it("files a page in the library's default category", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const created = article({
      id: "art-new",
      slug: "new-page",
      title: "New page",
    });
    const context = ctx({
      ...defaultHandlers(),
      kb_article_create: () => ({
        article_id: created.id,
        title: created.title,
      }),
      kb_article_get: () => ({ article: created }),
      kb_articles_list: () => ({
        articles: [summary({ ...created })],
        total: 1,
      }),
    });
    const document = await adapter.createNode?.(context as never, {
      kind: "node",
      name: "New page",
      parentPath: "",
    });
    expect(document?.recordId).toBe("art-new");
    expect(document?.path).toBe(
      `${KB_SEGMENT}/${CAT_SEGMENT}/new-page__art-new.article.md`
    );
    expect(context.calls.map((call) => call.op)).toContain("kb_article_create");
  });

  it("refuses a create at the root while the space's library is missing", async () => {
    // The library is created when Knowledge Base is mounted (kb_space_mount);
    // this tree never creates one, so a missing library is a setup to retry.
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx({
      kb_list: () => ({ knowledge_bases: [], total: 0 }),
    });
    await expect(
      adapter.createNode?.(context as never, {
        kind: "node",
        name: "New page",
        parentPath: "",
      })
    ).rejects.toMatchObject({ code: "kb_not_found" });
    expect(context.calls.map((call) => call.op)).not.toContain("kb_create");
  });

  it("creates a category folder inside a library", async () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    const context = ctx({
      ...defaultHandlers(),
      kb_category_create: () => ({ category_id: "cat-new", name: "Notes" }),
    });
    const document = await adapter.createNode?.(context as never, {
      kind: "folder",
      name: "Notes",
      parentPath: KB_SEGMENT,
    });
    expect(document?.recordId).toBe("cat-new");
    expect(document?.path).toBe(`${KB_SEGMENT}/notes__cat-new`);
    expect(document?.nodeType).toBe("kb.category");
  });
});

describe("the adapter's own shape", () => {
  it("declares both record scopes so an undecided mount does not hide it", () => {
    const adapter = createKnowledgeBaseSpaceDataAdapter();
    expect(adapter.recordScopes).toEqual(["all", "space"]);
    expect(adapter.root).toBe("Knowledge");
    expect(adapter.label).toBe("Knowledge");
    expect(adapter.rootNodeType).toBe("kb.root");
    expect(adapter.moduleId).toBe("knowledge-base");
    expect(adapter.alwaysVisible).toBeUndefined();
    expect(adapter.createNode).toBeTypeOf("function");
  });
});
