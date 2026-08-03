import { createClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import { resolveSupabaseConfig } from "../dal/supabase-config.js";
import type {
  AuditEventRow,
  ListOptions,
  PushEventInput,
  SourceKind,
} from "./audit-types.js";

const DEFAULT_MAX_ROWS = 100_000;

function toRow(
  event: PushEventInput,
  id: string,
  timestamp: string
): Record<string, unknown> {
  return {
    id,
    timestamp,
    type: event.type,
    actor_id: event.actorId ?? null,
    tenant_id: event.tenantId ?? null,
    module_id: event.moduleId ?? null,
    operation_id: event.operationId ?? null,
    detail: event.detail ?? {},
    source_kind: event.source_kind ?? "core",
    source_module_id: event.source_module_id ?? null,
    source_component: event.source_component ?? null,
  };
}

function mapRow(row: Record<string, unknown>): AuditEventRow {
  return {
    id: String(row.id),
    timestamp: String(row.timestamp),
    type: String(row.type),
    actor_id: row.actor_id == null ? null : String(row.actor_id),
    tenant_id: row.tenant_id == null ? null : String(row.tenant_id),
    module_id: row.module_id == null ? null : String(row.module_id),
    operation_id: row.operation_id == null ? null : String(row.operation_id),
    detail: JSON.stringify(row.detail ?? {}),
    source_kind: (row.source_kind as SourceKind) ?? "core",
    source_module_id:
      row.source_module_id == null ? null : String(row.source_module_id),
    source_component:
      row.source_component == null ? null : String(row.source_component),
  };
}

export function createAuditStoreSupabase(
  config: Record<string, unknown>,
  options?: { maxRows?: number }
) {
  const { url, serviceRoleKey } = resolveSupabaseConfig(config);
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const table = () => client.schema("core").from("audit_events");
  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;

  return {
    async push(event: PushEventInput) {
      const id = uuidv7();
      const timestamp = new Date().toISOString();
      const row = toRow(event, id, timestamp);
      const { error } = await table().insert(row as never);
      if (error) {
        throw new Error(`Audit push failed: ${error.message}`);
      }
      const { count } = await table().select("*", {
        count: "exact",
        head: true,
      });
      const total = count ?? 0;
      if (total > maxRows) {
        const toDelete = total - maxRows;
        const { data: oldest } = await table()
          .select("id")
          .order("timestamp", { ascending: true })
          .limit(toDelete);
        if (oldest?.length) {
          const ids = (oldest as { id: string }[]).map((r) => r.id);
          await table().delete().in("id", ids);
        }
      }
    },

    async list(limit = 200, opts: ListOptions = {}) {
      const effectiveLimit = opts.limit ?? limit;
      const offset = opts.offset ?? 0;
      let q = table()
        .select(
          "id, timestamp, type, actor_id, tenant_id, module_id, operation_id, detail, source_kind, source_module_id, source_component"
        )
        .order("timestamp", { ascending: false })
        .range(offset, offset + effectiveLimit - 1);
      if (opts.types?.length) {
        q = q.in("type", opts.types);
      }
      if (opts.actor_id) {
        q = q.eq("actor_id", opts.actor_id);
      }
      if (opts.module_id) {
        q = q.eq("module_id", opts.module_id);
      }
      if (opts.tenant_id) {
        q = q.eq("tenant_id", opts.tenant_id);
      }
      if (opts.from) {
        q = q.gte("timestamp", opts.from);
      }
      if (opts.to) {
        q = q.lte("timestamp", opts.to);
      }
      if (opts.search) {
        q = q.ilike("type", `%${opts.search}%`);
      }
      const { data, error } = await q;
      if (error) {
        throw new Error(`Audit list failed: ${error.message}`);
      }
      return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
    },

    async count(opts: Omit<ListOptions, "limit" | "offset"> = {}) {
      let q = table().select("*", { count: "exact", head: true });
      if (opts.types?.length) {
        q = q.in("type", opts.types);
      }
      if (opts.actor_id) {
        q = q.eq("actor_id", opts.actor_id);
      }
      if (opts.module_id) {
        q = q.eq("module_id", opts.module_id);
      }
      if (opts.tenant_id) {
        q = q.eq("tenant_id", opts.tenant_id);
      }
      if (opts.from) {
        q = q.gte("timestamp", opts.from);
      }
      if (opts.to) {
        q = q.lte("timestamp", opts.to);
      }
      if (opts.search) {
        q = q.ilike("type", `%${opts.search}%`);
      }
      const { count, error } = await q;
      if (error) {
        throw new Error(`Audit count failed: ${error.message}`);
      }
      return count ?? 0;
    },

    async distincts(tenant_id?: string) {
      // Walk distinct values with keyset pagination (one row per value).
      // A plain capped SELECT ordered by column only returns the first N
      // *rows*, so busy early module_ids starve later ones (e.g. "invoices").
      const collectDistinct = async (column: "type" | "module_id") => {
        const values: string[] = [];
        let cursor: string | undefined;
        for (;;) {
          let query = table()
            .select(column)
            .not(column, "is", null)
            .order(column)
            .limit(1);
          if (tenant_id) {
            query = query.eq("tenant_id", tenant_id);
          }
          if (cursor !== undefined) {
            query = query.gt(column, cursor);
          }
          const { data, error } = await query;
          if (error) {
            throw new Error(`Audit distincts failed: ${error.message}`);
          }
          // `.select(column)` with a union-typed column makes postgrest-js
          // infer a union of single-key row shapes, which cannot be indexed by
          // the same union. The row does have exactly this key.
          const raw = (data?.[0] as Record<string, unknown> | undefined)?.[
            column
          ];
          if (raw == null || !String(raw)) {
            break;
          }
          const value = String(raw);
          values.push(value);
          cursor = value;
          if (values.length > 5000) {
            break;
          }
        }
        return values;
      };

      const [types, module_ids] = await Promise.all([
        collectDistinct("type"),
        collectDistinct("module_id"),
      ]);
      return { types, module_ids };
    },
  };
}
