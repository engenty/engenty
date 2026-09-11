import { resolveDefaultSpaceId } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type {
  KnowledgeBase,
  KnowledgeBaseInput,
  KnowledgeBaseUpdateInput,
} from "../schema/types.js";
import type { EmitKbEvent, KbRepo } from "./contracts.js";
import { rowToKb, SCHEMA } from "./shared.js";

/** Thrown when a space already has its knowledge base. */
export class KbSpaceOccupiedError extends Error {
  readonly code = "space_has_knowledge_base";
  readonly spaceId: string;
  constructor(spaceId: string) {
    super("This space already has a knowledge base.");
    this.name = "KbSpaceOccupiedError";
    this.spaceId = spaceId;
  }
}

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

  /**
   * A space has exactly one knowledge base. The partial unique index on
   * `(tenant_id, space_id) where deleted_at is null` is the hard guard; this
   * check is the readable one, so a second create (or a move into an occupied
   * space) fails with a code the UI and the agent tools can name.
   */
  async function assertSpaceFree(spaceId: string, exceptKbId?: string) {
    const existing = await kb.list({ spaceId });
    if (existing.some((row) => row.id !== exceptKbId)) {
      throw new KbSpaceOccupiedError(spaceId);
    }
  }

  const kb: KbRepo = {
    async create(input: KnowledgeBaseInput): Promise<KnowledgeBase> {
      const id = uuidv7();
      const now = new Date().toISOString();
      // Absent means the tenant's DEFAULT space. There is no tenant-wide
      // library tier any more (Phase 6b) — a knowledge base is part of a
      // space's file tree, so every one of them names a space.
      // `as never`: matching this client slice against SupabaseClient's
      // generics blows the instantiation-depth limit (TS2589), the same
      // way it does in the tasks DAL.
      const spaceId =
        input.space_id ??
        (await resolveDefaultSpaceId(supabase as never, tenantId));
      if (spaceId) {
        await assertSpaceFree(spaceId);
      }
      const { data, error } = await kbs()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          space_id: spaceId,
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

    async list(filter?: { spaceId?: string | null }): Promise<KnowledgeBase[]> {
      let query = kbs()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .is("deleted_at", null);
      if (filter?.spaceId) {
        // A space sees exactly its own libraries. Phase 4 also matched
        // `space_id is null` here, for a tenant-wide tier that no longer
        // exists — the column is `not null` since Phase 6b.
        query = query.eq("space_id", filter.spaceId);
      }
      const { data, error } = await query.order("name");
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

    async update(
      id: string,
      input: KnowledgeBaseUpdateInput
    ): Promise<KnowledgeBase | null> {
      if (input.space_id) {
        await assertSpaceFree(input.space_id, id);
      }
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
