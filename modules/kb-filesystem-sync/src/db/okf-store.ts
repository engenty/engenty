/**
 * Direct `module_kb` upserts for import. Writes preserve the ids carried in
 * OKF frontmatter (so a Seed → Export → Clear → Import round-trip reproduces
 * the original rows) and bypass the KB repos — meaning no events fire and an
 * import never loops back into the sync path. Columns left unset fall back to
 * their DB defaults.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";

const SCHEMA = "module_kb";
const ARTICLE_STATUSES = new Set(["draft", "published", "archived"]);

type Fm = Record<string, unknown>;

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function createOkfStore(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const table = (name: string) => supabase.schema(SCHEMA).from(name);
  const now = () => new Date().toISOString();
  const defaultCategoryByKb = new Map<string, string>();

  // `articles.category_id` is NOT NULL with an on-delete-restrict FK, so an
  // article whose frontmatter carries no category must land in the KB's
  // mandatory `general` category (seeded by trigger for new KBs, backfilled
  // by migration for old ones; unique partial index guarantees at most one).
  async function resolveDefaultCategoryId(kbId: string): Promise<string> {
    const cached = defaultCategoryByKb.get(kbId);
    if (cached) {
      return cached;
    }
    const { data, error } = await table("categories")
      .select("id")
      .eq("kb_id", kbId)
      .eq("is_default", true)
      .maybeSingle();
    if (error || !data) {
      throw new Error(
        `No default category found for KB ${kbId}; cannot import an article without a category_id`
      );
    }
    const id = String((data as { id: string }).id);
    defaultCategoryByKb.set(kbId, id);
    return id;
  }

  return {
    async upsertKb(fm: Fm, _body: string): Promise<string> {
      const id = str(fm.id) || uuidv7();
      const slug = str(fm.slug, id);
      const { error } = await table("knowledge_bases").upsert(
        {
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          name: str(fm.name, slug),
          slug,
          description:
            typeof fm.description === "string" ? fm.description : null,
          created_at: str(fm.created_at, now()),
          updated_at: str(fm.updated_at, now()),
        },
        { onConflict: "id" }
      );
      if (error) {
        throw new Error(`Failed to upsert KB ${id}: ${error.message}`);
      }
      return id;
    },

    async upsertCategory(fm: Fm, body: string): Promise<string> {
      const id = str(fm.id) || uuidv7();
      const { error } = await table("categories").upsert(
        {
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          kb_id: str(fm.kb_id),
          parent_id: str(fm.parent_id) || null,
          name: str(fm.name, str(fm.slug, id)),
          slug: str(fm.slug, id),
          sort_order: num(fm.sort_order),
          view_type: fm.view_type === "folder" ? "folder" : "collection",
          intro_markdown: body || null,
          created_at: str(fm.created_at, now()),
          updated_at: str(fm.updated_at, now()),
        },
        { onConflict: "id" }
      );
      if (error) {
        throw new Error(`Failed to upsert category ${id}: ${error.message}`);
      }
      return id;
    },

    async upsertArticle(fm: Fm, body: string): Promise<string> {
      const id = str(fm.id) || uuidv7();
      const rawStatus = str(fm.status);
      const kbId = str(fm.kb_id);
      const categoryId =
        str(fm.category_id) || (await resolveDefaultCategoryId(kbId));
      const { error } = await table("articles").upsert(
        {
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          kb_id: kbId,
          category_id: categoryId,
          title: str(fm.title, str(fm.slug, id)),
          slug: str(fm.slug, id),
          status: ARTICLE_STATUSES.has(rawStatus) ? rawStatus : "draft",
          content_markdown: body || null,
          sort_order: num(fm.sort_order),
          created_at: str(fm.created_at, now()),
          updated_at: str(fm.updated_at, now()),
        },
        { onConflict: "id" }
      );
      if (error) {
        throw new Error(`Failed to upsert article ${id}: ${error.message}`);
      }
      await this.linkArticleTags(id, kbId, fm.tags);
      return id;
    },

    /** Resolve tag slugs to existing tag ids (never creates) and replace links. */
    async linkArticleTags(
      articleId: string,
      kbId: string,
      rawTags: unknown
    ): Promise<void> {
      const slugs = Array.isArray(rawTags)
        ? rawTags.filter((t): t is string => typeof t === "string")
        : [];
      await table("article_tags")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("article_id", articleId);
      if (slugs.length === 0 || !kbId) {
        return;
      }
      const { data } = await table("tags")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("kb_id", kbId)
        .in("slug", slugs);
      const rows = (data ?? []).map((r: { id: string }) => ({
        article_id: articleId,
        scope_id: scopeId,
        tag_id: String(r.id),
        tenant_id: tenantId,
      }));
      if (rows.length > 0) {
        await table("article_tags").insert(rows);
      }
    },
  };
}

export type OkfStore = ReturnType<typeof createOkfStore>;
