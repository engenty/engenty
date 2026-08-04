// Supabase store for persisted instruction overrides (tenant_override / user_override)
// and their change history. Base/agent/module/action documents are NOT stored here —
// they are derived from the registry (see ai/instructions/base-documents.ts).

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiInstructionChange,
  AiInstructionDocument,
  InstructionEditScope,
} from "../../ai/instructions/types.js";

const AI_SCHEMA = "ai";
const OVERRIDES_TABLE = "engenty_instruction_overrides";
const CHANGES_TABLE = "engenty_instruction_changes";

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapDocument(row: Record<string, unknown>): AiInstructionDocument {
  return {
    body: String(row.body ?? ""),
    created_at: String(row.created_at),
    created_by_user_id: asNullableString(row.created_by_user_id),
    document_key: String(row.document_key),
    id: String(row.id),
    is_active: Boolean(row.is_active),
    layer: row.layer as AiInstructionDocument["layer"],
    metadata: asJsonObject(row.metadata),
    module_id: String(row.module_id),
    source_kind: row.source_kind as AiInstructionDocument["source_kind"],
    tenant_id: asNullableString(row.tenant_id),
    title: String(row.title ?? ""),
    updated_at: String(row.updated_at),
    updated_by_user_id: asNullableString(row.updated_by_user_id),
    version: Number(row.version ?? 1),
  };
}

function mapChange(row: Record<string, unknown>): AiInstructionChange {
  return {
    approved_at: asNullableString(row.approved_at),
    approved_by_user_id: asNullableString(row.approved_by_user_id),
    change_reason: asNullableString(row.change_reason),
    created_at: String(row.created_at),
    id: String(row.id),
    instruction_doc_id: String(row.instruction_doc_id),
    next_body: String(row.next_body ?? ""),
    previous_body: asNullableString(row.previous_body),
    proposed_by_run_id: asNullableString(row.proposed_by_run_id),
    status: row.status as AiInstructionChange["status"],
  };
}

function sortByVersion(a: AiInstructionDocument, b: AiInstructionDocument) {
  if (a.version !== b.version) {
    return b.version - a.version;
  }
  return b.updated_at.localeCompare(a.updated_at);
}

export type InstructionOverridesStore = ReturnType<
  typeof createInstructionOverridesStore
>;

export function createInstructionOverridesStore(client: SupabaseClient) {
  const table = () => client.schema(AI_SCHEMA).from(OVERRIDES_TABLE);
  const changes = () => client.schema(AI_SCHEMA).from(CHANGES_TABLE);

  const store = {
    /** Active tenant overrides plus the caller's own user overrides. */
    async listActiveOverrides(params: {
      tenantId: string | null;
      userId: string | null;
    }): Promise<AiInstructionDocument[]> {
      if (params.tenantId == null) {
        return [];
      }
      const tenantQuery = table()
        .select("*")
        .eq("is_active", true)
        .eq("tenant_id", params.tenantId)
        .eq("layer", "tenant_override")
        .order("version", { ascending: false });
      const userQuery = params.userId
        ? table()
            .select("*")
            .eq("is_active", true)
            .eq("tenant_id", params.tenantId)
            .eq("layer", "user_override")
            .eq("created_by_user_id", params.userId)
            .order("version", { ascending: false })
        : Promise.resolve({ data: [], error: null });

      const [tenantResult, userResult] = await Promise.all([
        tenantQuery,
        userQuery,
      ]);
      if (tenantResult.error) {
        throw new Error(
          `Failed to list tenant overrides: ${tenantResult.error.message}`
        );
      }
      if (userResult.error) {
        throw new Error(
          `Failed to list user overrides: ${userResult.error.message}`
        );
      }
      return [...(tenantResult.data ?? []), ...(userResult.data ?? [])].map(
        (row) => mapDocument(row as Record<string, unknown>)
      );
    },

    /**
     * Append-only instruction docs for an agent (`${agentId}.append.*`),
     * highest version per key. Tenant overrides first, then user (user wins
     * when both exist for the same key).
     */
    async listAppendDocumentsForAgent(params: {
      agentId: string;
      tenantId: string | null;
      userId: string | null;
    }): Promise<AiInstructionDocument[]> {
      const prefix = `${params.agentId}.append.`;
      const all = await store.listActiveOverrides({
        tenantId: params.tenantId,
        userId: params.userId,
      });
      const byKey = new Map<string, AiInstructionDocument>();
      for (const document of all) {
        if (!document.document_key.startsWith(prefix)) {
          continue;
        }
        const existing = byKey.get(document.document_key);
        if (!existing) {
          byKey.set(document.document_key, document);
          continue;
        }
        // Prefer user_override over tenant_override; else higher version.
        const preferNext =
          (document.layer === "user_override" &&
            existing.layer !== "user_override") ||
          (document.layer === existing.layer &&
            (document.version > existing.version ||
              (document.version === existing.version &&
                document.updated_at > existing.updated_at)));
        if (preferNext) {
          byKey.set(document.document_key, document);
        }
      }
      return Array.from(byKey.values()).toSorted((left, right) =>
        left.document_key.localeCompare(right.document_key)
      );
    },

    async getScopedOverride(params: {
      documentKey: string;
      scope: InstructionEditScope;
      tenantId: string | null;
      userId: string | null;
    }): Promise<AiInstructionDocument | null> {
      if (params.tenantId == null) {
        return null;
      }
      let query = table()
        .select("*")
        .eq("document_key", params.documentKey)
        .eq("is_active", true)
        .eq("tenant_id", params.tenantId)
        .eq(
          "layer",
          params.scope === "tenant" ? "tenant_override" : "user_override"
        )
        .order("version", { ascending: false });
      if (params.scope === "user") {
        if (!params.userId) {
          return null;
        }
        query = query.eq("created_by_user_id", params.userId);
      }
      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to get scoped override: ${error.message}`);
      }
      return (
        (data ?? [])
          .map((row) => mapDocument(row as Record<string, unknown>))
          .sort(sortByVersion)[0] ?? null
      );
    },

    async upsertOverride(
      record: Partial<AiInstructionDocument> &
        Pick<
          AiInstructionDocument,
          "body" | "document_key" | "id" | "layer" | "module_id" | "title"
        >
    ): Promise<AiInstructionDocument> {
      const payload = {
        ...record,
        metadata: record.metadata ?? {},
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await table()
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();
      if (error) {
        throw new Error(`Failed to upsert override: ${error.message}`);
      }
      return mapDocument(data as Record<string, unknown>);
    },

    /**
     * Soft-clear the active scoped override so resolve falls back to seed/base.
     * Returns the deactivated document, or null when none was active.
     */
    async deactivateScopedOverride(params: {
      documentKey: string;
      reason: string | null;
      scope: InstructionEditScope;
      tenantId: string | null;
      userId: string | null;
    }): Promise<{
      change: AiInstructionChange;
      document: AiInstructionDocument;
    } | null> {
      const existing = await store.getScopedOverride({
        documentKey: params.documentKey,
        scope: params.scope,
        tenantId: params.tenantId,
        userId: params.userId,
      });
      if (!existing) {
        return null;
      }
      const now = new Date().toISOString();
      const document = await store.upsertOverride({
        ...existing,
        is_active: false,
        updated_by_user_id: params.userId,
        version: existing.version + 1,
      });
      const change = await store.appendChange({
        approved_at: now,
        approved_by_user_id: params.userId,
        change_reason: params.reason ?? "Reset to base",
        created_at: now,
        id: randomUUID(),
        instruction_doc_id: document.id,
        next_body: "",
        previous_body: existing.body,
        status: "applied",
      });
      return { change, document };
    },

    async appendChange(
      record: Partial<AiInstructionChange> &
        Pick<
          AiInstructionChange,
          "id" | "instruction_doc_id" | "next_body" | "status"
        >
    ): Promise<AiInstructionChange> {
      const { data, error } = await changes()
        .insert(record)
        .select("*")
        .single();
      if (error) {
        throw new Error(
          `Failed to append instruction change: ${error.message}`
        );
      }
      return mapChange(data as Record<string, unknown>);
    },

    async listChanges(params: {
      instruction_doc_id: string;
      limit?: number;
    }): Promise<AiInstructionChange[]> {
      const query = changes()
        .select("*")
        .eq("instruction_doc_id", params.instruction_doc_id)
        .order("created_at", { ascending: false });
      const { data, error } =
        typeof params.limit === "number"
          ? await query.limit(params.limit)
          : await query;
      if (error) {
        throw new Error(`Failed to list instruction changes: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        mapChange(row as Record<string, unknown>)
      );
    },
  };

  return store;
}
