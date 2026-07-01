import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  Article,
  ArticleInput,
  ArticlesQueryParams,
  ArticleUpdateInput,
  KbGraphInlineLink,
  KbGraphNode,
  PaginatedResponse,
} from "../schema/types.js";
import { extractKbArticleIdsFromContentJson } from "../services/extract-kb-inline-article-ids-from-content-json.js";
import { deriveKbSearchQueryVariants } from "../services/kb-search-query.js";
import { articleSnapshotToRestorePatch } from "../services/kb-version-snapshots.js";
import { countCommentsByArticleIds } from "./article-comments.js";
import type {
  ArticleActorContext,
  ArticleNavigationContext,
  ArticleRepo,
  EmitArticleEvent,
  KbArticleFtsSuggestion,
} from "./contracts.js";
import { flattenKbArticleReadingOrder } from "./kb-article-nav-order.js";
import type { KbVersionRepo } from "./kb-versions.js";
import { getTagsForIds, rowToArticle, SCHEMA } from "./shared.js";

async function attachCommentCountsToArticles(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  items: Article[]
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const counts = await countCommentsByArticleIds(
    supabase,
    tenantId,
    scopeId,
    items.map((item) => item.id)
  );
  for (const item of items) {
    item.comment_count = counts.get(item.id) ?? 0;
  }
}

import {
  ARTICLE_SLUG_MAX_LEN,
  isSafeCustomPropertyKey,
  kbArticleSearchTokens,
  sanitizeIlikeToken,
} from "./article-query-utils.js";

export function createArticleRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  versions: KbVersionRepo,
  options: { emitArticleEvent?: EmitArticleEvent } = {}
): ArticleRepo {
  const kbs = () => supabase.schema(SCHEMA).from("knowledge_bases");
  const tagsTable = () => supabase.schema(SCHEMA).from("tags");
  const arts = () => supabase.schema(SCHEMA).from("articles");
  const cats = () => supabase.schema(SCHEMA).from("categories");

  /**
   * Resolve the effective category for a write. If the caller supplies
   * `category_id`, it must belong to the same KB. When omitted/null we fall
   * back to the KB's mandatory `general` row (seeded by trigger /
   * migration). Throws if neither resolves — that should never happen
   * outside a broken seed.
   */
  async function resolveCategoryIdForKb(
    kbId: string,
    requested: string | null | undefined
  ): Promise<string> {
    if (requested) {
      const { data, error } = await cats()
        .select("id, kb_id")
        .eq("id", requested)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error || !data) {
        throw new Error("Category not found");
      }
      if (String((data as { kb_id: string }).kb_id) !== kbId) {
        throw new Error(
          "Category must belong to the same knowledge base as the article"
        );
      }
      return String((data as { id: string }).id);
    }
    const { data, error } = await cats()
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("kb_id", kbId)
      .eq("is_default", true)
      .maybeSingle();
    if (error || !data) {
      throw new Error(
        "Default category missing for knowledge base; check categories migration / trigger"
      );
    }
    return String((data as { id: string }).id);
  }

  // Persist-time hook — fan out canonical entity events. The SDK's
  // declarative re-index binding (registered in `src/plugin.ts`) handles
  // the actual `replaceDocument` / `deleteDocument` against the
  // `kb.article` search provider; the repo is no longer in the embedding
  // write path.
  const emit = options.emitArticleEvent;
  async function emitEntity(
    verb: "created" | "deleted" | "updated",
    payload: { article_id: string; kb_id?: string }
  ): Promise<void> {
    if (!emit) {
      return;
    }
    await emit(verb, {
      article_id: payload.article_id,
      kb_id: payload.kb_id,
      scope_id: scopeId,
      tenant_id: tenantId,
    });
  }

  async function assertValidParentArticle(
    kbId: string,
    articleId: string | null,
    parentArticleId: string | null
  ): Promise<void> {
    if (!parentArticleId) {
      return;
    }
    const { data: parentRow, error: parentErr } = await arts()
      .select("id, kb_id, parent_article_id")
      .eq("id", parentArticleId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle();
    if (parentErr || !parentRow) {
      throw new Error("Parent article not found");
    }
    if (String((parentRow as { kb_id: string }).kb_id) !== kbId) {
      throw new Error("Parent article must belong to the same knowledge base");
    }
    let current: string | null = parentArticleId;
    const seen = new Set<string>();
    while (current) {
      if (articleId && current === articleId) {
        throw new Error("Cannot set parent: would create a cycle");
      }
      if (seen.has(current)) {
        throw new Error("Parent article chain is invalid");
      }
      seen.add(current);
      const { data } = await arts()
        .select("parent_article_id")
        .eq("id", current)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .maybeSingle();
      const row = data as { parent_article_id: string | null } | null;
      current = row?.parent_article_id ? String(row.parent_article_id) : null;
    }
  }

  async function slugIsTakenByOtherArticle(
    kbId: string,
    candidate: string,
    excludeArticleId?: string
  ): Promise<boolean> {
    const { data, error } = await arts()
      .select("id")
      .eq("kb_id", kbId)
      .eq("tenant_id", tenantId)
      .eq("slug", candidate)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to check article slug: ${error.message}`);
    }
    if (!data) {
      return false;
    }
    if (
      excludeArticleId &&
      String((data as { id: string }).id) === excludeArticleId
    ) {
      return false;
    }
    return true;
  }

  function buildArticleSlugCandidate(base: string, n: number): string {
    if (n === 1) {
      return base.slice(0, ARTICLE_SLUG_MAX_LEN);
    }
    const suffix = `-${n}`;
    const maxBase = ARTICLE_SLUG_MAX_LEN - suffix.length;
    return `${base.slice(0, Math.max(1, maxBase))}${suffix}`;
  }

  async function ensureUniqueArticleSlug(
    kbId: string,
    baseSlug: string,
    excludeArticleId?: string
  ): Promise<string> {
    let base = baseSlug.trim();
    if (!base) {
      base = "article";
    }
    base = base.slice(0, ARTICLE_SLUG_MAX_LEN);

    for (let n = 1; n < 1000; n++) {
      const candidate = buildArticleSlugCandidate(base, n);
      const taken = await slugIsTakenByOtherArticle(
        kbId,
        candidate,
        excludeArticleId
      );
      if (!taken) {
        return candidate;
      }
    }
    throw new Error("Could not allocate a unique article slug");
  }

  const artTags = () => supabase.schema(SCHEMA).from("article_tags");
  const atts = () => supabase.schema(SCHEMA).from("attachments");
  const faqs_tbl = () => supabase.schema(SCHEMA).from("faqs");

  const articles: ArticleRepo = {
    async getSlugById(id: string): Promise<string | null> {
      const { data, error } = await arts()
        .select("slug")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      return String((data as { slug: string }).slug);
    },

    async create(
      input: ArticleInput,
      tagIds?: string[],
      actor?: ArticleActorContext | null
    ): Promise<Article> {
      await assertValidParentArticle(
        input.kb_id,
        null,
        input.parent_article_id ?? null
      );
      const categoryId = await resolveCategoryIdForKb(
        input.kb_id,
        input.category_id ?? null
      );
      const id = uuidv7();
      const now = new Date().toISOString();
      const principal = actor?.principalId?.trim() || null;
      const slug = await ensureUniqueArticleSlug(input.kb_id, input.slug);
      const { data, error } = await arts()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          kb_id: input.kb_id,
          category_id: categoryId,
          parent_article_id: input.parent_article_id ?? null,
          title: input.title,
          slug,
          status: input.status ?? "draft",
          content_json: input.content_json ?? null,
          content_markdown: input.content_markdown ?? null,
          summary: input.summary ?? null,
          questions_answered: input.questions_answered ?? [],
          original_document_url: input.original_document_url ?? null,
          original_document_name: input.original_document_name ?? null,
          sort_order: input.sort_order ?? 0,
          custom_properties: input.custom_properties ?? {},
          template_mode: input.template_mode ?? "inherit",
          template_id:
            input.template_mode === "template"
              ? (input.template_id ?? null)
              : null,
          created_by: principal,
          created_at: now,
          updated_at: now,
          updated_by: principal,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create article: ${error.message}`);
      }

      if (tagIds && tagIds.length > 0) {
        await artTags().insert(
          tagIds.map((tid) => ({ article_id: id, tag_id: tid }))
        );
      }

      const tagsMap = await getTagsForIds(
        supabase,
        tenantId,
        "article_tags",
        "article_id",
        [id]
      );
      const article = rowToArticle(
        data as Record<string, unknown>,
        tagsMap.get(id) ?? []
      );
      await versions.recordArticleVersion(article, principal);
      await emitEntity("created", {
        article_id: article.id,
        kb_id: article.kb_id,
      });
      return article;
    },

    async listPaginated(
      params: ArticlesQueryParams
    ): Promise<PaginatedResponse<Article>> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.page_size ?? 25, 1), 200);
      const sortBy = params.sort_by ?? "sort_order";
      const ascending = (params.sort_order ?? "asc") === "asc";

      const useFts =
        Boolean(params.search?.trim()) &&
        params.search_fts === true &&
        (!params.tag_ids || params.tag_ids.length === 0);

      if (useFts) {
        const { data: ftsResult, error: ftsErr } = await supabase
          .schema(SCHEMA)
          .rpc("kb_articles_fts_search", {
            p_tenant_id: tenantId,
            p_scope_id: scopeId,
            p_kb_id: params.kb_id,
            p_query: params.search!.trim(),
            p_limit: pageSize,
            p_offset: (page - 1) * pageSize,
            p_parent_article_id: params.parent_article_id ?? null,
            p_top_level_only: params.top_level_only ?? false,
            p_status: params.status ?? null,
          });
        if (ftsErr) {
          throw new Error(`FTS search failed: ${ftsErr.message}`);
        }
        const payload = ftsResult as { total?: number; ids?: unknown[] };
        const orderedIds = Array.isArray(payload?.ids)
          ? payload.ids.map((x) => String(x))
          : [];
        const total = Number(payload?.total ?? 0);
        if (orderedIds.length === 0) {
          return { data: [], total, page, page_size: pageSize };
        }
        const { data: rows, error: rowErr } = await arts()
          .select("*")
          .eq("tenant_id", tenantId)
          .in("id", orderedIds);
        if (rowErr) {
          throw new Error(`Failed to load FTS articles: ${rowErr.message}`);
        }
        const byId = new Map(
          (rows ?? []).map((r) => {
            const rec = r as Record<string, unknown>;
            return [String(rec.id), r] as const;
          })
        );
        const items = orderedIds
          .map((oid) => byId.get(oid))
          .filter(Boolean)
          .map((r) => rowToArticle(r as Record<string, unknown>));
        const ids = items.map((a) => a.id);
        const tagsMap = await getTagsForIds(
          supabase,
          tenantId,
          "article_tags",
          "article_id",
          ids
        );
        for (const item of items) {
          item.tags = tagsMap.get(item.id) ?? [];
        }
        await attachCommentCountsToArticles(supabase, tenantId, scopeId, items);
        return { data: items, total, page, page_size: pageSize };
      }

      let query = arts()
        .select("*", { count: "exact", head: false })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("kb_id", params.kb_id)
        .is("deleted_at", null);

      if (params.top_level_only) {
        query = query.is("parent_article_id", null);
      }
      if (params.parent_article_id) {
        query = query.eq("parent_article_id", params.parent_article_id);
      }
      if (params.category_id) {
        query = query.eq("category_id", params.category_id);
      }
      if (params.status) {
        query = query.eq("status", params.status);
      }
      if (params.search?.trim() && !params.search_fts) {
        const s = `%${params.search.trim()}%`;
        query = query.or(`title.ilike.${s},content_markdown.ilike.${s}`);
      }
      for (const [key, value] of Object.entries(
        params.template_property_filters ?? {}
      )) {
        if (!isSafeCustomPropertyKey(key)) {
          continue;
        }
        if (value === null) {
          query = query.is(`custom_properties->>${key}`, null);
        } else {
          query = query.filter(
            `custom_properties->>${key}`,
            "eq",
            String(value)
          );
        }
      }

      // Tag filtering: get article IDs that have ALL requested tags
      if (params.tag_ids && params.tag_ids.length > 0) {
        const { data: tagRows } = await artTags()
          .select("article_id")
          .in("tag_id", params.tag_ids);
        const articleIds = [
          ...new Set(
            (tagRows ?? []).map((r) =>
              String((r as { article_id: string }).article_id)
            )
          ),
        ];
        if (articleIds.length === 0) {
          return { data: [], total: 0, page, page_size: pageSize };
        }
        query = query.in("id", articleIds);
      }

      const orderColumn = sortBy.startsWith("custom:")
        ? `custom_properties->>${sortBy.slice("custom:".length)}`
        : sortBy;
      const safeOrderColumn =
        sortBy.startsWith("custom:") &&
        !isSafeCustomPropertyKey(sortBy.slice("custom:".length))
          ? "sort_order"
          : orderColumn;

      const { data, error, count } = await query
        .order(safeOrderColumn, { ascending })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) {
        throw new Error(`Failed to list articles: ${error.message}`);
      }

      const items = (data ?? []).map((r) =>
        rowToArticle(r as Record<string, unknown>)
      );

      // Attach tags
      const ids = items.map((a) => a.id);
      const tagsMap = await getTagsForIds(
        supabase,
        tenantId,
        "article_tags",
        "article_id",
        ids
      );
      for (const item of items) {
        item.tags = tagsMap.get(item.id) ?? [];
      }

      await attachCommentCountsToArticles(supabase, tenantId, scopeId, items);

      return { data: items, total: count ?? 0, page, page_size: pageSize };
    },

    async getById(id: string, kbIdOrSlug?: string): Promise<Article | null> {
      const UUID_REGEX =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let kbId: string | null = null;
      if (kbIdOrSlug) {
        if (UUID_REGEX.test(kbIdOrSlug)) {
          kbId = kbIdOrSlug;
        } else {
          const { data: kbData } = await kbs()
            .select("id")
            .eq("slug", kbIdOrSlug)
            .eq("tenant_id", tenantId)
            .is("deleted_at", null)
            .maybeSingle();
          if (kbData) {
            kbId = (kbData as { id: string }).id;
          }
        }
      }

      let query = arts()
        .select("*")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);
      if (UUID_REGEX.test(id)) {
        query = query.eq("id", id);
      } else {
        query = query.eq("slug", id);
      }
      if (kbId) {
        query = query.eq("kb_id", kbId);
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (error || !data) {
        return null;
      }

      const realId = String(data.id);
      const tagsMap = await getTagsForIds(
        supabase,
        tenantId,
        "article_tags",
        "article_id",
        [realId]
      );
      return rowToArticle(
        data as Record<string, unknown>,
        tagsMap.get(realId) ?? []
      );
    },

    async getByOriginalDocumentUrl(
      kbId: string,
      url: string
    ): Promise<Article | null> {
      const { data, error } = await arts()
        .select("*")
        .eq("kb_id", kbId)
        .eq("tenant_id", tenantId)
        .eq("original_document_url", url)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      return rowToArticle(data as Record<string, unknown>, []);
    },

    async suggestFts(
      kbId: string,
      query: string,
      limit: number
    ): Promise<KbArticleFtsSuggestion[]> {
      const lim = Math.min(Math.max(limit, 1), 25);
      const q = query.trim();
      if (q.length < 2) {
        return [];
      }

      const parseFtsPayload = (data: unknown): KbArticleFtsSuggestion[] => {
        let parsed: unknown[] = [];
        if (data == null) {
          parsed = [];
        } else if (Array.isArray(data)) {
          parsed = data;
        } else if (typeof data === "string") {
          try {
            const j = JSON.parse(data) as unknown;
            parsed = Array.isArray(j) ? j : [];
          } catch {
            parsed = [];
          }
        }
        return (parsed as KbArticleFtsSuggestion[]).map((r) => ({
          id: String((r as KbArticleFtsSuggestion).id),
          title: String((r as KbArticleFtsSuggestion).title),
          kb_id: String((r as KbArticleFtsSuggestion).kb_id),
          rank: Number((r as KbArticleFtsSuggestion).rank),
          headline: String((r as KbArticleFtsSuggestion).headline ?? ""),
          slug: "",
        }));
      };

      const callFtsSuggest = async (
        variant: string
      ): Promise<KbArticleFtsSuggestion[]> => {
        const { data, error } = await supabase
          .schema(SCHEMA)
          .rpc("kb_articles_fts_suggest", {
            p_tenant_id: tenantId,
            p_scope_id: scopeId,
            p_kb_id: kbId,
            p_query: variant.trim(),
            p_limit: lim,
          });
        if (error) {
          throw new Error(`FTS suggest failed: ${error.message}`);
        }
        return parseFtsPayload(data);
      };

      const byId = new Map<string, KbArticleFtsSuggestion>();
      const variants = deriveKbSearchQueryVariants(q).slice(0, 5);
      for (const variant of variants) {
        if (!variant.trim()) {
          continue;
        }
        const hits = await callFtsSuggest(variant);
        for (const h of hits) {
          const prev = byId.get(h.id);
          if (!prev || h.rank > prev.rank) {
            byId.set(h.id, h);
          }
        }
        if (byId.size >= lim * 2) {
          break;
        }
      }
      const fts = [...byId.values()]
        .sort(
          (a, b) =>
            b.rank - a.rank ||
            a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        )
        .slice(0, lim);

      const ilikeNeedle = q.replace(/[%_\\]/g, " ").trim();
      if (ilikeNeedle.length < 2) {
        return [];
      }

      const merged: KbArticleFtsSuggestion[] = [];
      const seen = new Set<string>();

      const tryAdd = (
        row: { id: string; title: string; kb_id: string; slug?: string },
        rank: number,
        headline: string
      ) => {
        const id = String(row.id);
        if (seen.has(id) || merged.length >= lim) {
          return;
        }
        seen.add(id);
        merged.push({
          id,
          title: String(row.title),
          kb_id: String(row.kb_id),
          rank,
          headline,
          slug: row.slug ? String(row.slug) : "",
        });
      };

      const tokens = kbArticleSearchTokens(ilikeNeedle)
        .map((t) => sanitizeIlikeToken(t))
        .filter((t) => t.length >= 2);
      if (tokens.length > 0) {
        const orClause = tokens
          .map((e) => `title.ilike.%${e}%,content_markdown.ilike.%${e}%`)
          .join(",");

        if (orClause.length > 0) {
          const { data: tokenRows, error: tokErr } = await arts()
            .select("id, title, kb_id, slug")
            .eq("tenant_id", tenantId)
            .eq("scope_id", scopeId)
            .eq("kb_id", kbId)
            .is("deleted_at", null)
            .or(orClause)
            .order("title", { ascending: true })
            .limit(lim * 6);

          if (!tokErr && tokenRows?.length) {
            for (const row of tokenRows) {
              tryAdd(row as never, 0, "");
            }
          }
        }
      }

      const escPhrase = sanitizeIlikeToken(ilikeNeedle);
      if (escPhrase.length >= 2) {
        const { data: phraseRows, error: phraseErr } = await arts()
          .select("id, title, kb_id, slug")
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .eq("kb_id", kbId)
          .is("deleted_at", null)
          .ilike("title", `%${escPhrase}%`)
          .order("title", { ascending: true })
          .limit(lim * 2);

        if (!phraseErr && phraseRows?.length) {
          for (const row of phraseRows) {
            tryAdd(row as never, 0, "");
          }
        }
      }

      for (const r of fts) {
        tryAdd(r, r.rank, r.headline);
      }

      const mergedResults = merged.slice(0, lim);
      const ids = mergedResults.filter((r) => !r.slug).map((r) => r.id);
      if (ids.length > 0) {
        const { data: slugRows } = await arts()
          .select("id, slug")
          .in("id", ids)
          .eq("tenant_id", tenantId)
          .is("deleted_at", null);
        if (slugRows) {
          const slugMap = new Map(
            slugRows.map((r: any) => [String(r.id), String(r.slug)])
          );
          for (const r of mergedResults) {
            if (!r.slug) {
              r.slug = slugMap.get(r.id) ?? "";
            }
          }
        }
      }

      return mergedResults;
    },

    async getNavigationContext(
      id: string
    ): Promise<ArticleNavigationContext | null> {
      const { data: row, error } = await arts()
        .select("id, title, slug, kb_id, parent_article_id, sort_order")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !row) {
        return null;
      }
      const self = row as {
        id: string;
        title: string;
        slug: string;
        kb_id: string;
        parent_article_id: string | null;
        sort_order: number;
      };

      const parent_chain: Array<{ id: string; title: string; slug: string }> =
        [];
      let pid: string | null = self.parent_article_id
        ? String(self.parent_article_id)
        : null;
      while (pid) {
        const { data: parent } = await arts()
          .select("id, title, slug, parent_article_id")
          .eq("id", pid)
          .eq("tenant_id", tenantId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!parent) {
          break;
        }
        const p = parent as {
          id: string;
          title: string;
          slug: string;
          parent_article_id: string | null;
        };
        parent_chain.unshift({ id: p.id, title: p.title, slug: p.slug });
        pid = p.parent_article_id ? String(p.parent_article_id) : null;
      }

      const { data: allArts, error: allErr } = await arts()
        .select("id, title, slug, parent_article_id, sort_order")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("kb_id", self.kb_id)
        .is("deleted_at", null);
      if (allErr) {
        throw new Error(
          `Failed to load articles for navigation: ${allErr.message}`
        );
      }
      const navArticles = (allArts ?? []) as Array<{
        id: string;
        title: string;
        slug: string;
        parent_article_id: string | null;
        sort_order: number;
      }>;
      const ordered = flattenKbArticleReadingOrder(navArticles);
      const idx = ordered.findIndex((a) => a.id === id);
      const prevVal = idx > 0 ? ordered[idx - 1]! : null;
      const nextVal =
        idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1]! : null;
      const prev = prevVal
        ? { id: prevVal.id, title: prevVal.title, slug: prevVal.slug }
        : null;
      const next = nextVal
        ? { id: nextVal.id, title: nextVal.title, slug: nextVal.slug }
        : null;
      const prev_to_hub = idx === 0;
      return { parent_chain, prev, next, prev_to_hub };
    },

    async listArticleIdsPaginated(params: {
      page?: number;
      page_size?: number;
    }): Promise<PaginatedResponse<{ id: string }>> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.page_size ?? 50, 1), 100);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await arts()
        .select("id", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (error) {
        throw new Error(`Failed to list article ids: ${error.message}`);
      }

      const rows = (data ?? []) as Array<{ id: string }>;
      const total = Number(count ?? 0);
      return {
        data: rows.map((r) => ({ id: String(r.id) })),
        total,
        page,
        page_size: pageSize,
      };
    },

    async update(
      id: string,
      input: ArticleUpdateInput,
      tagIds?: string[],
      actor?: ArticleActorContext | null
    ): Promise<Article | null> {
      const { data: existing } = await arts()
        .select("kb_id, parent_article_id, locked_at")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!existing) {
        return null;
      }
      const kbId = String((existing as { kb_id: string }).kb_id);
      const lockedAt = (existing as { locked_at: string | null }).locked_at;
      if (lockedAt) {
        const definedKeys = (
          Object.keys(input) as Array<keyof ArticleUpdateInput>
        ).filter((k) => input[k] !== undefined);
        const onlyUnlock =
          definedKeys.length === 1 &&
          definedKeys[0] === "locked_at" &&
          input.locked_at === null;
        if (!onlyUnlock) {
          throw new Error("Article is locked");
        }
      }
      const currentParent = (existing as { parent_article_id: string | null })
        .parent_article_id;
      const nextParent =
        input.parent_article_id === undefined
          ? currentParent
            ? String(currentParent)
            : null
          : input.parent_article_id;
      await assertValidParentArticle(kbId, id, nextParent);

      const principal = actor?.principalId?.trim();
      const patch: Record<string, unknown> = {
        ...input,
        updated_at: new Date().toISOString(),
        ...(principal ? { updated_by: principal } : {}),
      };
      if (
        input.template_mode !== undefined &&
        input.template_mode !== "template"
      ) {
        patch.template_id = null;
      }
      if (input.slug !== undefined) {
        patch.slug = await ensureUniqueArticleSlug(kbId, input.slug, id);
      }
      if (input.category_id !== undefined) {
        // Null/empty means "reset to KB default" rather than clear (the column is NOT NULL).
        patch.category_id = await resolveCategoryIdForKb(
          kbId,
          input.category_id ?? null
        );
      }
      // Set published_at when transitioning to published
      if (input.status === "published" && !input.published_at) {
        patch.published_at = new Date().toISOString();
      }

      const { data, error } = await arts()
        .update(patch)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();
      if (error || !data) {
        return null;
      }

      if (tagIds !== undefined) {
        await this.setTags(id, tagIds);
      }

      const tagsMap = await getTagsForIds(
        supabase,
        tenantId,
        "article_tags",
        "article_id",
        [id]
      );
      const article = rowToArticle(
        data as Record<string, unknown>,
        tagsMap.get(id) ?? []
      );
      await versions.recordArticleVersion(
        article,
        actor?.principalId?.trim() ?? null
      );
      await emitEntity("updated", {
        article_id: article.id,
        kb_id: article.kb_id,
      });
      return article;
    },

    async restoreFromVersion(
      id: string,
      version: number,
      actor?: ArticleActorContext | null
    ): Promise<Article | null> {
      const row = await versions.getArticleVersion(id, version);
      if (!row) {
        return null;
      }
      const restored = articleSnapshotToRestorePatch(row.snapshot);
      if (!restored) {
        throw new Error("Version snapshot is invalid or incomplete");
      }
      const { patch, tag_ids: tagIds } = restored;
      return this.update(id, patch, tagIds, actor);
    },

    async delete(id: string): Promise<boolean> {
      const { data: existing } = await arts()
        .select("kb_id")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const now = new Date().toISOString();
      const { error } = await arts()
        .update({
          deleted_at: now,
          updated_at: now,
          status: "removed",
        })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) {
        return false;
      }
      const kbId = existing
        ? String((existing as { kb_id: string }).kb_id)
        : undefined;
      await emitEntity("deleted", { article_id: id, kb_id: kbId });
      return true;
    },

    async setTags(articleId: string, tagIds: string[]): Promise<void> {
      await artTags().delete().eq("article_id", articleId);
      if (tagIds.length > 0) {
        await artTags().insert(
          tagIds.map((tid) => ({ article_id: articleId, tag_id: tid }))
        );
      }
    },

    async listAllForGraph(kbId: string): Promise<KbGraphNode[]> {
      const { data: rows, error } = await arts()
        .select("id, title, slug, status, parent_article_id, sort_order")
        .eq("kb_id", kbId)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });

      if (error || !rows) {
        return [];
      }

      const ids = (rows as Array<{ id: string }>).map((r) => r.id);
      const { data: tagRows } = await supabase
        .schema(SCHEMA)
        .from("article_tags" as never)
        .select("article_id, tag_id")
        .in("article_id", ids);

      const tagMap = new Map<string, string[]>();
      for (const row of (tagRows ?? []) as Array<{
        article_id: string;
        tag_id: string;
      }>) {
        const entry = tagMap.get(row.article_id) ?? [];
        entry.push(row.tag_id);
        tagMap.set(row.article_id, entry);
      }

      return (rows as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        title: String(r.title),
        slug: String(r.slug),
        status: String(r.status) as KbGraphNode["status"],
        parent_article_id: r.parent_article_id
          ? String(r.parent_article_id)
          : null,
        sort_order: Number(r.sort_order ?? 0),
        tag_ids: tagMap.get(String(r.id)) ?? [],
      }));
    },

    async listInlineLinksForGraph(kbId: string): Promise<KbGraphInlineLink[]> {
      const { data: rows, error } = await arts()
        .select("id, content_json")
        .eq("kb_id", kbId)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);

      if (error || !rows?.length) {
        return [];
      }

      const articleIds = new Set(
        (rows as Array<{ id: string }>).map((r) => String(r.id))
      );
      const edges: KbGraphInlineLink[] = [];

      for (const r of rows as Array<{
        id: string;
        content_json: unknown;
      }>) {
        const fromId = String(r.id);
        const targets = extractKbArticleIdsFromContentJson(r.content_json);
        for (const toId of targets) {
          if (toId === fromId || !articleIds.has(toId)) {
            continue;
          }
          edges.push({ from_article_id: fromId, to_article_id: toId });
        }
      }

      return edges;
    },
  };
  return articles;
}
