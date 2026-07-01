import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type { Tag, TagInput } from "../schema/types.js";
import type { TagRepo } from "./contracts.js";
import { rowToTag, SCHEMA } from "./shared.js";

export function createTagRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
): TagRepo {
  const tagsTable = () => supabase.schema(SCHEMA).from("tags");

  const tags: TagRepo = {
    async create(input: TagInput): Promise<Tag> {
      const id = uuidv7();
      const { data, error } = await tagsTable()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          kb_id: input.kb_id,
          name: input.name,
          slug: input.slug,
          color: input.color ?? null,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create tag: ${error.message}`);
      }
      return rowToTag(data as Record<string, unknown>);
    },

    async list(kbId: string): Promise<Tag[]> {
      const { data, error } = await tagsTable()
        .select("*")
        .eq("kb_id", kbId)
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) {
        throw new Error(`Failed to list tags: ${error.message}`);
      }
      return (data ?? []).map((r) => rowToTag(r as Record<string, unknown>));
    },

    async getById(id: string): Promise<Tag | null> {
      const { data, error } = await tagsTable()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      if (error || !data) {
        return null;
      }
      return rowToTag(data as Record<string, unknown>);
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await tagsTable()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
      return !error;
    },
  };
  return tags;
}
