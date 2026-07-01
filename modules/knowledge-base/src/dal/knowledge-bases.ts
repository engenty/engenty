import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  KnowledgeBase,
  KnowledgeBaseInput,
  KnowledgeBaseUpdateInput,
} from "../schema/types.js";
import type { EmitKbEvent, KbRepo } from "./contracts.js";
import { rowToKb, SCHEMA } from "./shared.js";

export function createKbRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  options: { emitKbEvent?: EmitKbEvent } = {}
): KbRepo {
  const kbs = () => supabase.schema(SCHEMA).from("knowledge_bases");

  const emit = options.emitKbEvent;
  async function emitKb(
    verb: "created" | "deleted" | "updated",
    kbId: string
  ): Promise<void> {
    if (!emit) {
      return;
    }
    await emit(verb, { kb_id: kbId, scope_id: scopeId, tenant_id: tenantId });
  }

  const kb: KbRepo = {
    async create(input: KnowledgeBaseInput): Promise<KnowledgeBase> {
      const id = uuidv7();
      const now = new Date().toISOString();
      const { data, error } = await kbs()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          is_default: input.is_default ?? false,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create KB: ${error.message}`);
      }
      const created = rowToKb(data as Record<string, unknown>);
      await emitKb("created", created.id);
      return created;
    },

    async list(): Promise<KnowledgeBase[]> {
      const { data, error } = await kbs()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null)
        .order("name");
      if (error) {
        throw new Error(`Failed to list KBs: ${error.message}`);
      }
      return (data ?? []).map((r) => rowToKb(r as Record<string, unknown>));
    },

    async getById(id: string): Promise<KnowledgeBase | null> {
      const { data, error } = await kbs()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .single();
      if (error || !data) {
        return null;
      }
      return rowToKb(data as Record<string, unknown>);
    },

    async getDefault(): Promise<KnowledgeBase | null> {
      const { data, error } = await kbs()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("is_default", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) {
        return null;
      }
      return rowToKb(data as Record<string, unknown>);
    },

    async update(
      id: string,
      input: KnowledgeBaseUpdateInput
    ): Promise<KnowledgeBase | null> {
      const { data, error } = await kbs()
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();
      if (error || !data) {
        return null;
      }
      const updated = rowToKb(data as Record<string, unknown>);
      await emitKb("updated", updated.id);
      return updated;
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await kbs()
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) {
        return false;
      }
      await emitKb("deleted", id);
      return true;
    },
  };
  return kb;
}
