/**
 * The knowledge base in the space Data tree (PLAN-space-data.md Phase K).
 *
 * The KB was the last module reaching the tree through the legacy drive lane —
 * a hard-coded fetch in apps/ui plus a `page` node kind that
 * `@engenty/file-storage` had to know about. That lane could not be mounted,
 * could not be written, could not be exported, and — the part that mattered —
 * was invisible to agents, because the `/data` mount walks adapter roots and
 * the KB had no adapter. The space's actual prose was the one thing an agent
 * could not read.
 *
 * Every read and write here goes through `ctx.invokeOperation`, so an agent
 * editing `Knowledge/handbook__<id>/guides__<id>/onboarding__<id>.article.md`
 * is calling `kb_article_update` and gets `kb_article_update`'s approval card.
 *
 * The shape of the tree a human sees when Knowledge Base is mounted:
 *
 * ```
 * Knowledge/                              ← this adapter's root (the heading)
 *   Neue Seite                            ← an article in the hidden default bucket
 *   Notes/                                ← a folder the user made
 *     nested.md
 *   Setup.article/                        ← an article that has sub-pages
 *     step-one.md
 * ```
 *
 * Space Pages (markdown artifacts) are a different root — they do not live here.
 *
 * The library (`kb.base`) and the seeded General category are storage, not
 * rows. `category_id` is still required on the article table, so a create at
 * the root files into General — the listing just does not show that folder.
 * Paths still carry both ids (`pages__<kbId>/general__<catId>/…`) so locate
 * stays a parse, not a scan.
 *
 * The file-face path of one page (what an agent reads):
 *
 * ```
 * Knowledge/
 *   pages__<kbId>/
 *     general__<catId>/
 *       onboarding__<artId>.article.md
 *       setup__<artId>.article/
 *         index.article.md
 *         step-one__<artId>.article.md
 * ```
 *
 * **A parent article is a virtual folder** (Matthias, 2026-08-15). It is the
 * `folder = directory + index` rule from decision 3 applied to a record: the
 * article keeps one home, its sub-pages sit under it the way the knowledge
 * base's own sidebar nests them, and the folder view can render the article
 * AND its children on one page. The cost is honest and worth naming: an
 * article's path CHANGES when it gains its first child. That is survivable
 * only because identity is the record id, carried in the file and in every
 * segment of the path — never the path itself (§1b).
 */

import {
  assertSpaceDataVersion,
  notFoundError,
  notSupportedError,
  PluginOperationError,
  parseFrontmatter,
  type SpaceDataAdapter,
  type SpaceDataContext,
  type SpaceDataCreateInput,
  type SpaceDataDocument,
  type SpaceDataEntry,
  type SpaceDataFolder,
  type SpaceDataListing,
  type SpaceDataNodeType,
  type SpaceDataWriteInput,
  serializeFrontmatter,
  spaceDataFieldUnchanged,
  spaceDataNodeName,
  spaceDataNodeRecordId,
  spaceDataPathSegments,
} from "@engenty/plugin-sdk";

/** A leaf article's file. */
export const ARTICLE_EXTENSION = ".article.md";

/**
 * A parent article's folder.
 *
 * Deliberately NOT `.article.md`: a name either ends with the file extension or
 * with the folder one, never both, so a single `endsWith` says which of the two
 * faces of an article a path segment names. (`"x.article.md".endsWith(".article")`
 * is false — the longer extension cannot be mistaken for the shorter.)
 */
export const ARTICLE_FOLDER_EXTENSION = ".article";

/** The parent article, inside its own folder. */
export const ARTICLE_INDEX_NAME = `index${ARTICLE_EXTENSION}`;

export const KB_ROOT_NODE_TYPE = "kb.root";
export const KB_BASE_NODE_TYPE = "kb.base";
export const KB_CATEGORY_NODE_TYPE = "kb.category";
/**
 * One id for both faces of an article.
 *
 * The record surface is `spaces.data.node:kb.article` and the folder surface is
 * `spaces.data.folder:kb.article` — the host already distinguishes a node that
 * is READ from a folder that is LISTED, so the type does not have to say it
 * twice.
 */
export const KB_ARTICLE_NODE_TYPE = "kb.article";

const ARTICLE_NODE_TYPE: SpaceDataNodeType = {
  extension: ARTICLE_EXTENSION,
  id: KB_ARTICLE_NODE_TYPE,
  kind: "record",
  label: "Page",
};

/** The op's own ceiling, which is the DAL's ceiling. */
const PAGE_SIZE = 200;

/**
 * Fields the file shows but a file write may not change.
 *
 * `kb_id` is here because moving an article to another LIBRARY is not a file
 * edit — the libraries are different spaces' property, and the tree would be
 * carrying a record out of the space that owns it.
 */
const READ_ONLY_FIELDS = [
  "id",
  "kb_id",
  "created_at",
  "updated_at",
  "locked_at",
] as const;

/**
 * What a file may change.
 *
 * `category_id` and `parent_article_id` are IN this set on purpose: they are
 * the taxonomy, and moving a node between folders is the corresponding update
 * operation (§1b, decision 3) — the same way a contact moves between People and
 * Organisations by its `type`. The file face has no `move`, so the field is
 * where a move is expressed.
 */
const WRITABLE_FIELDS = [
  "title",
  "slug",
  "status",
  "summary",
  "category_id",
  "parent_article_id",
] as const;

/**
 * Said in the body when an article's text lives only in editor blocks.
 *
 * The alternative is an empty body, which reads as "this article is empty" —
 * a lie about the one thing the file exists to carry. Rendering the blocks as
 * markdown here is not available: both converters in `@engenty/tiptap-editor`
 * build a real TipTap `Editor`, which needs a DOM this process does not have.
 */
const BLOCKS_ONLY_BODY =
  "> This article's body is stored as editor blocks and has no markdown copy.\n> Open it in the knowledge base to read or edit it.\n";

interface KbRow {
  description?: string | null;
  id: string;
  name: string;
  slug: string;
}

interface CategoryRow {
  description?: string | null;
  id: string;
  is_default?: boolean;
  kb_id: string;
  name: string;
  parent_id: string | null;
  sort_order?: number;
}

/** A row of `kb_articles_list` — enough to place an article, never its body. */
interface ArticleSummaryRow {
  category_id: string;
  id: string;
  parent_article_id: string | null;
  slug: string;
  status: string;
  summary: string | null;
  title: string;
  updated_at: string;
}

interface ArticleRow extends ArticleSummaryRow {
  content_json?: Record<string, unknown> | null;
  content_markdown?: string | null;
  created_at?: string;
  kb_id: string;
  locked_at?: string | null;
}

/**
 * Run one KB operation, refusing an error that arrives as a VALUE.
 *
 * KB gateway handlers resolve with `{ error: "Article is locked" }` rather than
 * throwing. A caller that only guards against a rejection reports a save that
 * never happened — which is the exact silent-write failure the space data
 * protocol exists to prevent, so the check lives at the one door every call
 * here goes through.
 */
async function invoke<T>(
  ctx: SpaceDataContext,
  operationId: string,
  input: Record<string, unknown>
): Promise<T> {
  const result = (await ctx.invokeOperation(operationId, input)) as T | null;
  const message = (result as { error?: unknown } | null)?.error;
  if (typeof message === "string" && message) {
    if (/not found/i.test(message)) {
      throw notFoundError("kb_not_found", message);
    }
    throw new PluginOperationError(
      /locked/i.test(message) ? "article_locked" : "kb_operation_failed",
      message,
      { status: 400 }
    );
  }
  if (!result) {
    throw notFoundError("kb_not_found", `${operationId} returned nothing.`);
  }
  return result;
}

async function listBases(ctx: SpaceDataContext): Promise<KbRow[]> {
  /**
   * Always narrowed to the space, under BOTH record scopes.
   *
   * A knowledge base belongs to exactly one space (`space_id` is `not null`
   * since Phase 6b), so "all" has no wider set to offer here — widening would
   * mean showing another space's library inside this one, which containment
   * forbids. The adapter still DECLARES both scopes, because one that omitted
   * `all` would hide its root for every mount that left `record_scope`
   * undecided, and that is the common case.
   */
  const result = await invoke<{ knowledge_bases?: KbRow[] }>(ctx, "kb_list", {
    space_id: ctx.spaceId,
  });
  return result.knowledge_bases ?? [];
}

async function findBase(ctx: SpaceDataContext, kbId: string): Promise<KbRow> {
  const base = (await listBases(ctx)).find((row) => row.id === kbId);
  if (!base) {
    throw notFoundError(
      "kb_not_found",
      "No knowledge base with that id in this space."
    );
  }
  return base;
}

async function listCategories(
  ctx: SpaceDataContext,
  kbId: string
): Promise<CategoryRow[]> {
  const result = await invoke<{ categories?: CategoryRow[] }>(
    ctx,
    "kb_categories_list",
    { kb_id: kbId }
  );
  return result.categories ?? [];
}

async function listArticles(
  ctx: SpaceDataContext,
  input: { categoryId: string; kbId: string }
): Promise<{ rows: ArticleSummaryRow[]; total: number }> {
  const result = await invoke<{
    articles?: ArticleSummaryRow[];
    total?: number;
  }>(ctx, "kb_articles_list", {
    category_id: input.categoryId,
    kb_id: input.kbId,
    page_size: PAGE_SIZE,
  });
  return { rows: result.articles ?? [], total: result.total ?? 0 };
}

async function getArticle(
  ctx: SpaceDataContext,
  articleId: string
): Promise<ArticleRow> {
  const result = await invoke<{ article?: ArticleRow }>(ctx, "kb_article_get", {
    article_id: articleId,
  });
  if (!result.article) {
    throw notFoundError("article_not_found", `No article with id ${articleId}`);
  }
  return result.article;
}

/* ── Names and paths ─────────────────────────────────────────────────────── */

/** `handbook__<id>` — a readable stem and the exact identity, like a record. */
function folderSegment(title: string, id: string, extension = ""): string {
  return spaceDataNodeName({ extension, recordId: id, title });
}

function articleFileName(article: { id: string; title: string }): string {
  return spaceDataNodeName({
    extension: ARTICLE_EXTENSION,
    recordId: article.id,
    title: article.title,
  });
}

function articleFolderName(article: { id: string; title: string }): string {
  return folderSegment(article.title, article.id, ARTICLE_FOLDER_EXTENSION);
}

type Located =
  | { articleId: string; kind: "article" }
  | { articleId: string; kbId: string; kind: "articleFolder" }
  | { categoryId: string; kbId: string; kind: "category" }
  | { kbId: string; kind: "base" }
  | { kind: "root" };

/**
 * What a path names, decided from the path alone.
 *
 * Every segment carries its record id, so this resolves without a lookup —
 * which is the property that keeps the Cabinet failure mode (resolve a path by
 * scanning) out of the tree. Middle segments are not re-validated: the last
 * segment's id is authoritative and every operation still enforces the
 * caller's own scope, so a hand-edited middle segment reaches the same node
 * rather than a different one.
 */
export function locateSpaceDataPath(path: string): Located {
  const segments = spaceDataPathSegments(path);
  if (segments.length === 0) {
    return { kind: "root" };
  }
  const kbId = spaceDataNodeRecordId(segments[0] ?? "", "");
  if (!kbId) {
    throw notFoundError(
      "kb_not_found",
      `"${segments[0]}" does not name a knowledge base.`
    );
  }
  if (segments.length === 1) {
    return { kbId, kind: "base" };
  }
  const last = segments.at(-1) ?? "";
  if (last === ARTICLE_INDEX_NAME) {
    const articleId = spaceDataNodeRecordId(
      segments.at(-2) ?? "",
      ARTICLE_FOLDER_EXTENSION
    );
    if (!articleId) {
      throw notFoundError(
        "article_not_found",
        `"${path}" is not inside an article folder.`
      );
    }
    return { articleId, kind: "article" };
  }
  if (last.endsWith(ARTICLE_EXTENSION)) {
    const articleId = spaceDataNodeRecordId(last, ARTICLE_EXTENSION);
    if (!articleId) {
      throw notFoundError("article_not_found", `"${path}" is not an article.`);
    }
    return { articleId, kind: "article" };
  }
  if (last.endsWith(ARTICLE_FOLDER_EXTENSION)) {
    const articleId = spaceDataNodeRecordId(last, ARTICLE_FOLDER_EXTENSION);
    if (!articleId) {
      throw notFoundError("article_not_found", `"${path}" is not an article.`);
    }
    return { articleId, kbId, kind: "articleFolder" };
  }
  const categoryId = spaceDataNodeRecordId(last, "");
  if (!categoryId) {
    throw notFoundError("category_not_found", `"${path}" is not a category.`);
  }
  return { categoryId, kbId, kind: "category" };
}

/* ── Nesting ─────────────────────────────────────────────────────────────── */

/**
 * One category's articles, nested by parent — the knowledge base's own rule.
 *
 * A child whose parent sits in a DIFFERENT category is shown at the top of its
 * own category rather than under that parent, which is exactly what the KB
 * sidebar does (`buildCategoryArticleForest`). Two reasons it has to work this
 * way: an article must have exactly ONE home in the tree, and a category is
 * fetched on its own, so a parent outside the bucket is not there to nest
 * under.
 */
export function nestArticles(rows: readonly ArticleSummaryRow[]): {
  childrenOf: Map<string, ArticleSummaryRow[]>;
  topLevel: ArticleSummaryRow[];
} {
  const byId = new Map(rows.map((row) => [row.id, row]));
  /**
   * Does following this article's parents terminate?
   *
   * A cycle would leave every article in it parented and none of them at the
   * top, so the whole loop would vanish from the folder — and, worse than in
   * the old UI-side projection, an agent walking `/data` would recurse through
   * it. Cheaper to walk the chain than to explain the missing pages later.
   */
  const reachesTop = (id: string): boolean => {
    const seen = new Set<string>([id]);
    let cursor = byId.get(id)?.parent_article_id ?? null;
    while (cursor && byId.has(cursor)) {
      if (seen.has(cursor)) {
        return false;
      }
      seen.add(cursor);
      cursor = byId.get(cursor)?.parent_article_id ?? null;
    }
    return true;
  };

  const childrenOf = new Map<string, ArticleSummaryRow[]>();
  const topLevel: ArticleSummaryRow[] = [];
  for (const row of rows) {
    const parentId = row.parent_article_id;
    const nested = Boolean(
      parentId && byId.has(parentId) && reachesTop(row.id)
    );
    if (nested && parentId) {
      childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), row]);
    } else {
      topLevel.push(row);
    }
  }
  const byTitle = (a: ArticleSummaryRow, b: ArticleSummaryRow) =>
    a.title.localeCompare(b.title);
  topLevel.sort(byTitle);
  for (const list of childrenOf.values()) {
    list.sort(byTitle);
  }
  return { childrenOf, topLevel };
}

/* ── Projection ──────────────────────────────────────────────────────────── */

function entryOf(
  article: ArticleSummaryRow,
  parentPath: string
): SpaceDataEntry {
  const name = articleFileName(article);
  return {
    kind: "record",
    name,
    nodeType: KB_ARTICLE_NODE_TYPE,
    path: joinPath(parentPath, name),
    recordId: article.id,
    // The file name is a slug carrying a uuid; the title is what a reader
    // recognises. Both travel, because both are needed for different jobs.
    title: article.title,
    updatedAt: article.updated_at,
    version: article.updated_at,
  };
}

function articleFolderOf(
  article: ArticleSummaryRow,
  parentPath: string
): SpaceDataFolder {
  const name = articleFolderName(article);
  return {
    name: article.title,
    nodeType: KB_ARTICLE_NODE_TYPE,
    path: joinPath(parentPath, name),
    ...(article.summary ? { description: article.summary } : {}),
  };
}

function categoryFolderOf(
  category: CategoryRow,
  parentPath: string
): SpaceDataFolder {
  return {
    name: category.name,
    nodeType: KB_CATEGORY_NODE_TYPE,
    path: joinPath(parentPath, folderSegment(category.name, category.id)),
    ...(category.description ? { description: category.description } : {}),
  };
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function isDefaultCategory(category: CategoryRow): boolean {
  return Boolean(category.is_default);
}

/**
 * One library, as the Pages section should look: pages and user folders,
 * never the library itself and never the seeded General bucket.
 */
async function listLibraryPages(
  ctx: SpaceDataContext,
  base: KbRow
): Promise<{
  entries: SpaceDataEntry[];
  folders: SpaceDataFolder[];
  truncated?: boolean;
}> {
  const libraryPath = folderSegment(base.name, base.id);
  const categories = await listCategories(ctx, base.id);
  const defaultCategory = categories.find(isDefaultCategory);
  const folders = categories
    .filter((category) => {
      if (isDefaultCategory(category)) {
        return false;
      }
      if (!category.parent_id) {
        return true;
      }
      return Boolean(
        defaultCategory && category.parent_id === defaultCategory.id
      );
    })
    .map((category) => {
      const parentPath =
        defaultCategory && category.parent_id === defaultCategory.id
          ? joinPath(
              libraryPath,
              folderSegment(defaultCategory.name, defaultCategory.id)
            )
          : libraryPath;
      return categoryFolderOf(category, parentPath);
    });

  if (!defaultCategory) {
    return { entries: [], folders };
  }

  const articles = await listArticles(ctx, {
    categoryId: defaultCategory.id,
    kbId: base.id,
  });
  const defaultPath = joinPath(
    libraryPath,
    folderSegment(defaultCategory.name, defaultCategory.id)
  );
  const { childrenOf, topLevel } = nestArticles(articles.rows);
  return {
    entries: topLevel
      .filter((article) => !childrenOf.has(article.id))
      .map((article) => entryOf(article, defaultPath)),
    folders: [
      ...folders,
      ...topLevel
        .filter((article) => childrenOf.has(article.id))
        .map((article) => articleFolderOf(article, defaultPath)),
    ],
    ...(articles.total > articles.rows.length ? { truncated: true } : {}),
  };
}

function mergePageListings(
  listings: ReadonlyArray<{
    entries: SpaceDataEntry[];
    folders: SpaceDataFolder[];
    truncated?: boolean;
  }>
): {
  entries: SpaceDataEntry[];
  folders: SpaceDataFolder[];
  truncated?: boolean;
} {
  return {
    entries: listings.flatMap((listing) => listing.entries),
    folders: listings.flatMap((listing) => listing.folders),
    ...(listings.some((listing) => listing.truncated)
      ? { truncated: true }
      : {}),
  };
}

/** The article's body, or an honest account of where the body is. */
export function articleBody(article: ArticleRow): string {
  const markdown = article.content_markdown ?? "";
  if (markdown.trim()) {
    return markdown;
  }
  return article.content_json ? BLOCKS_ONLY_BODY : "";
}

export function renderArticleFile(article: ArticleRow): string {
  const frontmatter: Record<string, unknown> = {
    id: article.id,
    title: article.title,
    slug: article.slug,
    status: article.status,
  };
  if (article.summary) {
    frontmatter.summary = article.summary;
  }
  frontmatter.category_id = article.category_id;
  if (article.parent_article_id) {
    frontmatter.parent_article_id = article.parent_article_id;
  }
  frontmatter.kb_id = article.kb_id;
  if (article.locked_at) {
    frontmatter.locked_at = article.locked_at;
  }
  frontmatter.updated_at = article.updated_at;
  return serializeFrontmatter(frontmatter, articleBody(article));
}

function documentOf(article: ArticleRow, path: string): SpaceDataDocument {
  const name = path.split("/").at(-1) ?? articleFileName(article);
  return {
    kind: "record",
    members: [
      {
        content: renderArticleFile(article),
        contentType: "text/markdown",
        derived: false,
        editable: true,
        encoding: "utf8",
        name,
      },
    ],
    name,
    nodeType: KB_ARTICLE_NODE_TYPE,
    path,
    recordId: article.id,
    updatedAt: article.updated_at,
    version: article.updated_at,
  };
}

/* ── Writing ─────────────────────────────────────────────────────────────── */

/**
 * Build the update patch from an edited file.
 *
 * Refusals rather than silent drops, in three cases: a changed read-only
 * field, a field the article schema does not know, and a body edit on an
 * article whose text lives in editor blocks. The third is the one that matters
 * — the reader prefers `content_json` when it is set, so writing
 * `content_markdown` next to it would save successfully and change NOTHING on
 * screen. An article authored as plain markdown (no `content_json`) has no such
 * shadow, and its body edits apply exactly as they read.
 */
export function articlePatchFromFile(input: {
  current: ArticleRow;
  text: string;
}): Record<string, unknown> {
  const { body, frontmatter } = parseFrontmatter(input.text);
  const patch: Record<string, unknown> = {};
  const currentRow = input.current as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(frontmatter)) {
    if ((READ_ONLY_FIELDS as readonly string[]).includes(key)) {
      if (!spaceDataFieldUnchanged(currentRow[key], value)) {
        throw new PluginOperationError(
          "read_only_field",
          key === "kb_id"
            ? "An article cannot be moved to another knowledge base by editing this file."
            : `"${key}" is set by the system and cannot be edited here.`,
          { details: { field: key }, status: 400 }
        );
      }
      continue;
    }
    if (!(WRITABLE_FIELDS as readonly string[]).includes(key)) {
      throw new PluginOperationError(
        "unknown_field",
        `"${key}" is not a field of a knowledge article — this file can set ${WRITABLE_FIELDS.join(", ")}.`,
        { details: { field: key }, status: 400 }
      );
    }
    if (!spaceDataFieldUnchanged(currentRow[key], value)) {
      patch[key] = value;
    }
  }
  const currentBody = articleBody(input.current);
  if (body.trimEnd() !== currentBody.trimEnd()) {
    if (input.current.content_json) {
      throw new PluginOperationError(
        "body_not_editable",
        "This article's body is stored as editor blocks, and the blocks are what the knowledge base shows — saving markdown here would change nothing on screen. Edit it in the knowledge base instead.",
        { details: { field: "content_markdown" }, status: 400 }
      );
    }
    patch.content_markdown = body;
  }
  return patch;
}

function slugifySegment(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "folder";
}

/**
 * The space's library. It exists from the moment Knowledge Base is mounted
 * here (`kb_space_mount`, the module's mountOperation); this tree never
 * creates one. Missing means that setup did not finish — re-adding the module
 * in the space's setup retries it. Space Pages (markdown artifacts) are a
 * different root and need no library.
 */
async function requireSpaceLibrary(ctx: SpaceDataContext): Promise<KbRow> {
  const existing = await listBases(ctx);
  if (existing[0]) {
    return existing[0];
  }
  throw notFoundError(
    "kb_not_found",
    "This space's knowledge base is not set up yet. Re-add Knowledge Base in the space's setup to create it."
  );
}

async function defaultCategory(
  ctx: SpaceDataContext,
  kbId: string
): Promise<CategoryRow> {
  const categories = await listCategories(ctx, kbId);
  const preferred =
    categories.find((row) => row.is_default) ??
    categories.find((row) => !row.parent_id) ??
    categories[0];
  if (!preferred) {
    throw notFoundError(
      "category_not_found",
      "This library has no folder to file a page in."
    );
  }
  return preferred;
}

function categoryDocument(
  category: { id: string; name: string },
  parentPath: string
): SpaceDataDocument {
  const name = folderSegment(category.name, category.id);
  return {
    kind: "bundle",
    members: [],
    name,
    nodeType: KB_CATEGORY_NODE_TYPE,
    path: joinPath(parentPath, name),
    recordId: category.id,
    version: new Date().toISOString(),
  };
}

async function createArticleDocument(
  ctx: SpaceDataContext,
  input: {
    categoryId?: string | null;
    kbId: string;
    name: string;
    parentArticleId?: string | null;
  }
): Promise<SpaceDataDocument> {
  const created = await invoke<{ article_id?: string }>(
    ctx,
    "kb_article_create",
    {
      content: `# ${input.name}\n`,
      kb_id: input.kbId,
      status: "published",
      title: input.name,
      ...(input.categoryId ? { category_id: input.categoryId } : {}),
      ...(input.parentArticleId
        ? { parent_article_id: input.parentArticleId }
        : {}),
    }
  );
  if (!created.article_id) {
    throw notFoundError("article_not_found", "The page could not be created.");
  }
  const article = await getArticle(ctx, created.article_id);
  return documentOf(article, await articlePath(ctx, article));
}

async function createKbNode(
  ctx: SpaceDataContext,
  input: SpaceDataCreateInput
): Promise<SpaceDataDocument> {
  const located = locateSpaceDataPath(input.parentPath);

  if (input.kind === "folder") {
    if (located.kind === "article" || located.kind === "articleFolder") {
      throw notSupportedError(
        "A page holds sub-pages, not folders — create a page."
      );
    }
    const base =
      located.kind === "root"
        ? await requireSpaceLibrary(ctx)
        : await findBase(ctx, located.kbId);
    const parentId = located.kind === "category" ? located.categoryId : null;
    const created = await invoke<{ category_id?: string; name?: string }>(
      ctx,
      "kb_category_create",
      {
        kb_id: base.id,
        name: input.name,
        slug: slugifySegment(input.name),
        ...(parentId ? { parent_id: parentId } : {}),
      }
    );
    if (!created.category_id) {
      throw notFoundError(
        "category_not_found",
        "The folder could not be created here."
      );
    }
    const parentPath =
      located.kind === "root"
        ? folderSegment(base.name, base.id)
        : input.parentPath;
    return categoryDocument(
      { id: created.category_id, name: created.name ?? input.name },
      parentPath
    );
  }

  if (located.kind === "article") {
    throw notSupportedError(
      "A page cannot be created inside an article file — create it on the folder."
    );
  }
  if (located.kind === "articleFolder") {
    const parent = await getArticle(ctx, located.articleId);
    await assertInSpace(ctx, parent, input.parentPath);
    return createArticleDocument(ctx, {
      categoryId: parent.category_id,
      kbId: parent.kb_id,
      name: input.name,
      parentArticleId: parent.id,
    });
  }
  const base =
    located.kind === "root"
      ? await requireSpaceLibrary(ctx)
      : await findBase(ctx, located.kbId);
  const category =
    located.kind === "category"
      ? (await listCategories(ctx, located.kbId)).find(
          (row) => row.id === located.categoryId
        )
      : await defaultCategory(ctx, base.id);
  if (!category) {
    throw notFoundError(
      "category_not_found",
      "No category with that id in this knowledge base."
    );
  }
  return createArticleDocument(ctx, {
    categoryId: category.id,
    kbId: base.id,
    name: input.name,
  });
}

export function createKnowledgeBaseSpaceDataAdapter(): SpaceDataAdapter {
  return {
    label: "Knowledge",
    moduleId: "knowledge-base",
    nodeTypes: [ARTICLE_NODE_TYPE],
    recordScopes: ["all", "space"],
    root: "Knowledge",
    rootNodeType: KB_ROOT_NODE_TYPE,

    async list(ctx, path): Promise<SpaceDataListing> {
      const located = locateSpaceDataPath(path);

      if (located.kind === "root") {
        const bases = await listBases(ctx);
        return mergePageListings(
          await Promise.all(bases.map((base) => listLibraryPages(ctx, base)))
        );
      }

      if (located.kind === "base") {
        const base = await findBase(ctx, located.kbId);
        return {
          ...(await listLibraryPages(ctx, base)),
          self: {
            name: base.name,
            nodeType: KB_BASE_NODE_TYPE,
            path,
            ...(base.description ? { description: base.description } : {}),
          },
        };
      }

      if (located.kind === "category") {
        const [categories, articles] = await Promise.all([
          listCategories(ctx, located.kbId),
          listArticles(ctx, {
            categoryId: located.categoryId,
            kbId: located.kbId,
          }),
        ]);
        const category = categories.find(
          (row) => row.id === located.categoryId
        );
        if (!category) {
          throw notFoundError(
            "category_not_found",
            "No category with that id in this knowledge base."
          );
        }
        const { childrenOf, topLevel } = nestArticles(articles.rows);
        return {
          entries: topLevel
            .filter((article) => !childrenOf.has(article.id))
            .map((article) => entryOf(article, path)),
          folders: [
            ...categories
              .filter((row) => row.parent_id === category.id)
              .map((row) => categoryFolderOf(row, path)),
            ...topLevel
              .filter((article) => childrenOf.has(article.id))
              .map((article) => articleFolderOf(article, path)),
          ],
          self: categoryFolderOf(category, parentOf(path)),
          ...(articles.total > articles.rows.length ? { truncated: true } : {}),
        };
      }

      if (located.kind !== "articleFolder") {
        throw notFoundError(
          "article_not_found",
          `"${path}" names an article file, and a file is read rather than listed.`
        );
      }

      // An article folder: the article itself, then its sub-pages.
      const article = await getArticle(ctx, located.articleId);
      const articles = await listArticles(ctx, {
        categoryId: article.category_id,
        kbId: located.kbId,
      });
      const { childrenOf } = nestArticles(articles.rows);
      const children = childrenOf.get(article.id) ?? [];
      return {
        entries: [
          {
            kind: "record",
            // Listed, not hidden: the folder's own view renders the article
            // inline, but the FILE face must be able to see the text that
            // belongs to this folder — an agent listing it would otherwise find
            // the sub-pages and not the page.
            name: ARTICLE_INDEX_NAME,
            nodeType: KB_ARTICLE_NODE_TYPE,
            path: joinPath(path, ARTICLE_INDEX_NAME),
            recordId: article.id,
            title: article.title,
            updatedAt: article.updated_at,
            version: article.updated_at,
          },
          ...children
            .filter((row) => !childrenOf.has(row.id))
            .map((row) => entryOf(row, path)),
        ],
        folders: children
          .filter((row) => childrenOf.has(row.id))
          .map((row) => articleFolderOf(row, path)),
        self: {
          name: article.title,
          nodeType: KB_ARTICLE_NODE_TYPE,
          path,
          ...(article.summary ? { description: article.summary } : {}),
        },
        ...(articles.total > articles.rows.length ? { truncated: true } : {}),
      };
    },

    async read(ctx, path): Promise<SpaceDataDocument> {
      const located = locateSpaceDataPath(path);
      if (located.kind !== "article") {
        throw notFoundError(
          "article_not_found",
          `"${path}" names a folder, and a folder is listed rather than read.`
        );
      }
      const article = await getArticle(ctx, located.articleId);
      await assertInSpace(ctx, article, path);
      return documentOf(article, path);
    },

    async write(ctx, input: SpaceDataWriteInput): Promise<SpaceDataDocument> {
      const located = locateSpaceDataPath(input.path);
      if (located.kind !== "article") {
        throw notFoundError(
          "article_not_found",
          `"${input.path}" names a folder, and a folder cannot be written.`
        );
      }
      const name = input.path.split("/").at(-1) ?? "";
      if (input.member && input.member !== name) {
        throw notFoundError(
          "member_not_found",
          "An article is a single file and has no members."
        );
      }
      if (input.encoding === "base64") {
        throw new PluginOperationError(
          "unsupported_encoding",
          "An article file is text; send it as utf8.",
          { status: 400 }
        );
      }
      const current = await getArticle(ctx, located.articleId);
      await assertInSpace(ctx, current, input.path);
      assertSpaceDataVersion(current.updated_at, input.baseVersion, {
        recordId: current.id,
      });
      if (current.locked_at) {
        throw new PluginOperationError(
          "article_locked",
          "This article is locked — unlock it in the knowledge base before editing.",
          { status: 400 }
        );
      }
      const patch = articlePatchFromFile({ current, text: input.content });
      if (Object.keys(patch).length === 0) {
        // Nothing changed. Returning the document is honest and cheap; the
        // update operation would refuse an empty patch anyway.
        return documentOf(current, input.path);
      }
      await invoke<{ article?: ArticleRow }>(ctx, "kb_article_update", {
        article_id: current.id,
        patch,
      });
      // Re-read rather than trust the write's echo: the article may have MOVED
      // (a changed `category_id` or `parent_article_id` is a move), and the
      // caller needs the path it now lives at, not the one it was saved from.
      const updated = await getArticle(ctx, current.id);
      return documentOf(updated, await articlePath(ctx, updated));
    },

    async createNode(
      ctx: SpaceDataContext,
      input: SpaceDataCreateInput
    ): Promise<SpaceDataDocument> {
      return createKbNode(ctx, input);
    },
  };
}

/**
 * Refuse an article that belongs to another space.
 *
 * The article operations are tenant-scoped, not space-scoped, so an id typed
 * into a path could otherwise pull a page out of a library this space does not
 * own — the containment the whole spaces tier rests on. The check is one
 * indexed read of the space's libraries.
 */
async function assertInSpace(
  ctx: SpaceDataContext,
  article: ArticleRow,
  path: string
): Promise<void> {
  const bases = await listBases(ctx);
  if (!bases.some((base) => base.id === article.kb_id)) {
    throw notFoundError(
      "article_not_found",
      `"${path}" is not in a knowledge base belonging to this space.`
    );
  }
}

/** The path immediately above one, or `""` at the adapter root. */
function parentOf(path: string): string {
  const segments = spaceDataPathSegments(path);
  return segments.slice(0, -1).join("/");
}

/**
 * Where an article lives now — base, category chain, parent chain, leaf.
 *
 * Only the write path needs this: a read already has the caller's path, and
 * recomputing it there would spend three operations to rediscover what the
 * request said. A write can move a record, and reporting the OLD path after a
 * move would hand the caller a path that no longer resolves.
 */
async function articlePath(
  ctx: SpaceDataContext,
  article: ArticleRow
): Promise<string> {
  const [base, categories, articles] = await Promise.all([
    findBase(ctx, article.kb_id),
    listCategories(ctx, article.kb_id),
    listArticles(ctx, {
      categoryId: article.category_id,
      kbId: article.kb_id,
    }),
  ]);
  const byId = new Map(categories.map((row) => [row.id, row]));
  const categoryChain: CategoryRow[] = [];
  let cursor = byId.get(article.category_id);
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    categoryChain.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }

  const { childrenOf } = nestArticles(articles.rows);
  const rowsById = new Map(articles.rows.map((row) => [row.id, row]));
  const ancestors: ArticleSummaryRow[] = [];
  const seenArticles = new Set<string>([article.id]);
  let parentId = article.parent_article_id;
  while (parentId && rowsById.has(parentId) && !seenArticles.has(parentId)) {
    seenArticles.add(parentId);
    const parent = rowsById.get(parentId);
    if (!parent) {
      break;
    }
    ancestors.unshift(parent);
    parentId = parent.parent_article_id;
  }

  const segments = [
    folderSegment(base.name, base.id),
    ...categoryChain.map((row) => folderSegment(row.name, row.id)),
    ...ancestors.map((row) => articleFolderName(row)),
  ];
  segments.push(
    childrenOf.has(article.id)
      ? `${articleFolderName(article)}/${ARTICLE_INDEX_NAME}`
      : articleFileName(article)
  );
  return segments.join("/");
}
