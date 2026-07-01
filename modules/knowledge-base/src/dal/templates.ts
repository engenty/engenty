import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  KbArticleTemplate,
  KbArticleTemplateInput,
  KbArticleTemplateUpdateInput,
} from "../schema/types.js";
import type { KbTemplateRepo } from "./contracts.js";
import { rowToTemplate, SCHEMA } from "./shared.js";

export function createKbTemplateRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
): KbTemplateRepo {
  const templates = () => supabase.schema(SCHEMA).from("article_templates");

  return {
    async create(input: KbArticleTemplateInput): Promise<KbArticleTemplate> {
      const id = uuidv7();
      const now = new Date().toISOString();
      const { data, error } = await templates()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          kb_id: input.kb_id,
          name: input.name,
          description: input.description ?? null,
          property_definitions: input.property_definitions ?? [],
          content_json: input.content_json ?? null,
          content_markdown: input.content_markdown ?? null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create KB template: ${error.message}`);
      }
      return rowToTemplate(data as Record<string, unknown>);
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await templates()
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      return !error;
    },

    async getById(id: string): Promise<KbArticleTemplate | null> {
      const { data, error } = await templates()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      return rowToTemplate(data as Record<string, unknown>);
    },

    async list(kbId: string): Promise<KbArticleTemplate[]> {
      const { data, error } = await templates()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("kb_id", kbId)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) {
        throw new Error(`Failed to list KB templates: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToTemplate(row as Record<string, unknown>)
      );
    },

    async update(
      id: string,
      input: KbArticleTemplateUpdateInput
    ): Promise<KbArticleTemplate | null> {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      const keys: (keyof KbArticleTemplateUpdateInput)[] = [
        "name",
        "description",
        "property_definitions",
        "content_json",
        "content_markdown",
      ];
      for (const key of keys) {
        if (input[key] !== undefined) {
          patch[key] = input[key];
        }
      }
      const { data, error } = await templates()
        .update(patch)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to update KB template: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      return rowToTemplate(data as Record<string, unknown>);
    },
  };
}
