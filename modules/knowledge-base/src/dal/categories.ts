/**
 * Knowledge Base — categories repo (hierarchical folder tree).
 *
 * Categories are the mandatory folder layer above articles. Every KB owns a
 * seeded `general` row (created by `module_kb.kb_seed_default_category`
 * trigger and the corresponding migration backfill). Article create/update
 * paths resolve `general` automatically when the caller does not pick one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import { normalizeKbCategoryPageSettings } from "../schema/categories.js";
import type {
  KbCategory,
  KbCategoryInput,
  KbCategoryUpdateInput,
} from "../schema/types.js";
import type { CategoryRepo, EmitCategoryEvent } from "./contracts.js";
import { rowToCategory, SCHEMA } from "./shared.js";

export function createCategoryRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  options: { emitCategoryEvent?: EmitCategoryEvent } = {}
): CategoryRepo {
  const cats = () => supabase.schema(SCHEMA).from("categories");

  const emit = options.emitCategoryEvent;
  async function emitCategory(
    verb: "created" | "deleted" | "updated",
    categoryId: string,
    kbId: string
  ): Promise<void> {
    if (!emit) {
      return;
    }
    await emit(verb, {
      category_id: categoryId,
      kb_id: kbId,
      scope_id: scopeId,
      tenant_id: tenantId,
    });
  }

  async function assertSlugUnique(
    kbId: string,
    slug: string,
    excludeId?: string
  ): Promise<void> {
    let query = cats()
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("kb_id", kbId)
      .eq("slug", slug);
    if (excludeId) {
      query = query.neq("id", excludeId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`Failed to validate category slug: ${error.message}`);
    }
    if (data) {
      throw new Error(`Category slug already exists: ${slug}`);
    }
  }

  async function assertParentBelongsToKb(
    kbId: string,
    parentId: string | null,
    selfId: string | null
  ): Promise<void> {
    if (!parentId) {
      return;
    }
    if (selfId && parentId === selfId) {
      throw new Error("Category cannot be its own parent");
    }
    const { data, error } = await cats()
      .select("id, kb_id, parent_id")
      .eq("id", parentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !data) {
      throw new Error("Parent category not found");
    }
    if (String((data as { kb_id: string }).kb_id) !== kbId) {
      throw new Error("Parent category must belong to the same knowledge base");
    }
    // Detect cycles by walking up.
    let current = String(
      (data as { parent_id: string | null }).parent_id ?? ""
    );
    const seen = new Set<string>([parentId]);
    while (current) {
      if (selfId && current === selfId) {
        throw new Error("Cannot set parent: would create a cycle");
      }
      if (seen.has(current)) {
        throw new Error("Parent category chain is invalid");
      }
      seen.add(current);
      const { data: row } = await cats()
        .select("parent_id")
        .eq("id", current)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      current = row
        ? String((row as { parent_id: string | null }).parent_id ?? "")
        : "";
    }
  }

  return {
    async list(kbId: string): Promise<KbCategory[]> {
      const { data, error } = await cats()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("kb_id", kbId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        throw new Error(`Failed to list categories: ${error.message}`);
      }
      return (data ?? []).map((r) =>
        rowToCategory(r as Record<string, unknown>)
      );
    },

    async getById(id: string): Promise<KbCategory | null> {
      const { data, error } = await cats()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      return rowToCategory(data as Record<string, unknown>);
    },

    async getDefaultForKb(kbId: string): Promise<KbCategory | null> {
      const { data, error } = await cats()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("kb_id", kbId)
        .eq("is_default", true)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      return rowToCategory(data as Record<string, unknown>);
    },

    async create(input: KbCategoryInput): Promise<KbCategory> {
      await assertSlugUnique(input.kb_id, input.slug);
      await assertParentBelongsToKb(input.kb_id, input.parent_id ?? null, null);
      const id = uuidv7();
      const now = new Date().toISOString();
      const { data, error } = await cats()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          kb_id: input.kb_id,
          parent_id: input.parent_id ?? null,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          sort_order: input.sort_order ?? 0,
          is_default: false,
          view_type: input.view_type ?? "folder",
          comments_mode: input.comments_mode ?? "inherit",
          template_mode: input.template_mode ?? "inherit",
          template_id: input.template_id ?? null,
          page_settings: normalizeKbCategoryPageSettings(input.page_settings),
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create category: ${error.message}`);
      }
      const created = rowToCategory(data as Record<string, unknown>);
      await emitCategory("created", created.id, created.kb_id);
      return created;
    },

    async update(
      id: string,
      input: KbCategoryUpdateInput
    ): Promise<KbCategory | null> {
      const existing = await this.getById(id);
      if (!existing) {
        return null;
      }
      if (input.slug !== undefined && input.slug !== existing.slug) {
        await assertSlugUnique(existing.kb_id, input.slug, id);
      }
      if (input.parent_id !== undefined) {
        await assertParentBelongsToKb(
          existing.kb_id,
          input.parent_id ?? null,
          id
        );
      }
      // Only write keys that were actually provided so undefined never clobbers an existing cover/intro/etc.
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      const writableKeys: (keyof KbCategoryUpdateInput)[] = [
        "name",
        "slug",
        "description",
        "icon",
        "parent_id",
        "sort_order",
        "template_id",
        "template_mode",
        "comments_mode",
        "cover",
        "cover_inheritance",
        "intro_json",
        "intro_markdown",
        "outro_json",
        "outro_markdown",
        "view_type",
        "page_settings",
      ];
      for (const key of writableKeys) {
        if (input[key] !== undefined) {
          patch[key] = input[key];
        }
      }
      if (
        input.template_mode !== undefined &&
        input.template_mode !== "template"
      ) {
        patch.template_id = null;
      }
      const { data, error } = await cats()
        .update(patch)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();
      if (error || !data) {
        return null;
      }
      const updated = rowToCategory(data as Record<string, unknown>);
      await emitCategory("updated", updated.id, updated.kb_id);
      return updated;
    },

    async delete(id: string): Promise<boolean> {
      const existing = await this.getById(id);
      if (!existing) {
        return false;
      }
      if (existing.is_default) {
        throw new Error(
          "Cannot delete the default 'general' category for a knowledge base"
        );
      }
      // Move any articles in this category back to the KB's `general` row
      // before deleting; the `articles_category_id_fkey` is `on delete restrict`.
      const fallback = await this.getDefaultForKb(existing.kb_id);
      if (!fallback) {
        throw new Error(
          "Default category missing for knowledge base; cannot reassign articles"
        );
      }
      const arts = supabase.schema(SCHEMA).from("articles");
      await arts
        .update({
          category_id: fallback.id,
          updated_at: new Date().toISOString(),
        })
        .eq("category_id", id)
        .eq("tenant_id", tenantId);
      const faqs = supabase.schema(SCHEMA).from("faqs");
      await faqs
        .update({
          category_id: fallback.id,
          updated_at: new Date().toISOString(),
        })
        .eq("category_id", id)
        .eq("tenant_id", tenantId);
      // Re-parent any nested categories to this category's parent so the
      // sub-tree does not become orphaned.
      await cats()
        .update({
          parent_id: existing.parent_id,
          updated_at: new Date().toISOString(),
        })
        .eq("parent_id", id)
        .eq("tenant_id", tenantId);
      const { error } = await cats()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) {
        return false;
      }
      await emitCategory("deleted", id, existing.kb_id);
      return true;
    },
  };
}
