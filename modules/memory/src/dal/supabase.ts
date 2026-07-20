import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type { MemoryRecord } from "../schema/zod.js";
import { memoryRecordSchema } from "../schema/zod.js";
import type {
  EmitMemoryEvent,
  MemoryRecordListFilter,
  MemoryRecordUpsert,
  MemoryRepo,
} from "./contracts.js";

const SCHEMA = "module_memory";

export interface MemoryRepoOptions {
  emitMemoryEvent?: EmitMemoryEvent;
}

function rowToRecord(row: Record<string, unknown>): MemoryRecord {
  return memoryRecordSchema.parse(row);
}

/**
 * Tenant+scope-bound repo over module_memory.records. The service-role client
 * bypasses RLS, so the tenant boundary is enforced explicitly on every query
 * (same convention as modules/secrets — see BUG-1 note there).
 */
export function createMemoryRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string,
  options: MemoryRepoOptions = {}
): MemoryRepo {
  const supabase = adapter as SupabaseClient;
  const records = () => supabase.schema(SCHEMA).from("records");
  const { emitMemoryEvent } = options;

  const emit = async (
    verb: "created" | "updated" | "archived",
    recordId: string
  ) => {
    await emitMemoryEvent?.(verb, {
      record_id: recordId,
      scope_id: scopeId,
      tenant_id: tenantId,
    });
  };

  async function findBySlug(
    scopeKind: string,
    scopeRef: string | null,
    slug: string
  ): Promise<MemoryRecord | null> {
    let query = records()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("scope_kind", scopeKind)
      .eq("slug", slug);
    query =
      scopeRef === null
        ? query.is("scope_ref", null)
        : query.eq("scope_ref", scopeRef);
    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`memory record lookup failed: ${error.message}`);
    }
    return data ? rowToRecord(data as Record<string, unknown>) : null;
  }

  return {
    async upsert(input: MemoryRecordUpsert): Promise<MemoryRecord> {
      const now = new Date().toISOString();
      const existing = await findBySlug(
        input.scope_kind,
        input.scope_ref,
        input.slug
      );
      if (existing) {
        // Re-saving a slug updates the record in place. Status transitions are
        // deliberate: an update keeps the current status unless the caller
        // forces one (org-scope agent writes force 'proposed' — an agent must
        // not be able to reactivate an archived/proposed record by re-saving).
        const patch: Record<string, unknown> = {
          title: input.title,
          body_md: input.body_md,
          kind: input.kind,
          confidence: input.confidence,
          source_kind: input.source_kind,
          updated_at: now,
          ...(input.status ? { status: input.status } : {}),
          ...(input.agent_type_key !== undefined
            ? { agent_type_key: input.agent_type_key }
            : {}),
          ...(input.supersedes !== undefined
            ? { supersedes: input.supersedes }
            : {}),
        };
        const { data, error } = await records()
          .update(patch)
          .eq("id", existing.id)
          .eq("tenant_id", tenantId)
          .select("*")
          .single();
        if (error) {
          throw new Error(`memory record update failed: ${error.message}`);
        }
        const record = rowToRecord(data as Record<string, unknown>);
        await emit("updated", record.id);
        return record;
      }
      const { data, error } = await records()
        .insert({
          id: uuidv7(),
          tenant_id: tenantId,
          scope_id: scopeId,
          scope_kind: input.scope_kind,
          scope_ref: input.scope_ref,
          kind: input.kind,
          slug: input.slug,
          title: input.title,
          body_md: input.body_md,
          source_kind: input.source_kind,
          agent_type_key: input.agent_type_key ?? null,
          confidence: input.confidence,
          status: input.status ?? "active",
          supersedes: input.supersedes ?? null,
          created_by: input.created_by ?? null,
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error) {
        throw new Error(`memory record insert failed: ${error.message}`);
      }
      const record = rowToRecord(data as Record<string, unknown>);
      await emit("created", record.id);
      return record;
    },

    async getById(id: string): Promise<MemoryRecord | null> {
      const { data, error } = await records()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        throw new Error(`memory record get failed: ${error.message}`);
      }
      return data ? rowToRecord(data as Record<string, unknown>) : null;
    },

    async list(filter: MemoryRecordListFilter = {}): Promise<MemoryRecord[]> {
      let query = records()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (filter.scope_kind) {
        query = query.eq("scope_kind", filter.scope_kind);
      }
      if (filter.scope_ref !== undefined) {
        query =
          filter.scope_ref === null
            ? query.is("scope_ref", null)
            : query.eq("scope_ref", filter.scope_ref);
      }
      if (filter.kind) {
        query = query.eq("kind", filter.kind);
      }
      if (filter.status) {
        query = query.eq("status", filter.status);
      }
      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .limit(filter.limit ?? 50);
      if (error) {
        throw new Error(`memory record list failed: ${error.message}`);
      }
      return ((data ?? []) as Record<string, unknown>[]).map(rowToRecord);
    },

    async archive(id: string): Promise<MemoryRecord> {
      const { data, error } = await records()
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select("*")
        .single();
      if (error) {
        throw new Error(`memory record archive failed: ${error.message}`);
      }
      const record = rowToRecord(data as Record<string, unknown>);
      await emit("archived", record.id);
      return record;
    },

    async approve(id: string): Promise<MemoryRecord> {
      const { data, error } = await records()
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("status", "proposed")
        .select("*")
        .single();
      if (error) {
        throw new Error(`memory record approve failed: ${error.message}`);
      }
      const record = rowToRecord(data as Record<string, unknown>);
      await emit("updated", record.id);
      return record;
    },
  };
}
