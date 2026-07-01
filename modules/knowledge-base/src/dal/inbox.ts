import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type { PaginatedResponse } from "../schema/shared.js";
import type {
  InboxItem,
  InboxItemInput,
  InboxItemUpdateInput,
  KbActivityLogEntry,
  SourceReference,
} from "../schema/types.js";
import type {
  InboxQueryParams,
  InboxRepo,
  KbActivityLogRepo,
  SourceReferenceRepo,
} from "./contracts.js";
import { SCHEMA } from "./shared.js";

function rowToInboxItem(row: Record<string, unknown>): InboxItem {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    kb_id: String(row.kb_id),
    title: String(row.title),
    source_type: row.source_type as InboxItem["source_type"],
    source_url: row.source_url ? String(row.source_url) : null,
    linked_kb_source_id:
      row.linked_kb_source_id == null ? null : String(row.linked_kb_source_id),
    linked_adapter_id:
      row.linked_adapter_id == null ? null : String(row.linked_adapter_id),
    raw_markdown: row.raw_markdown == null ? null : String(row.raw_markdown),
    raw_text: row.raw_text == null ? null : String(row.raw_text),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    triage_summary:
      row.triage_summary == null ? null : String(row.triage_summary),
    triage_metadata:
      row.triage_metadata && typeof row.triage_metadata === "object"
        ? (row.triage_metadata as Record<string, unknown>)
        : null,
    status: row.status as InboxItem["status"],
    captured_at: String(row.captured_at),
    processed_at: row.processed_at ? String(row.processed_at) : null,
    promoted_article_id: row.promoted_article_id
      ? String(row.promoted_article_id)
      : null,
    promoted_faq_id: row.promoted_faq_id ? String(row.promoted_faq_id) : null,
    discarded_at: row.discarded_at ? String(row.discarded_at) : null,
    original_storage_path: row.original_storage_path
      ? String(row.original_storage_path)
      : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

interface InboxKbSourceLink {
  adapter_id: string;
  kb_source_id: string;
}

async function loadInboxKbSourceLinks(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  inboxIds: string[]
): Promise<Map<string, InboxKbSourceLink>> {
  const out = new Map<string, InboxKbSourceLink>();
  if (inboxIds.length === 0) {
    return out;
  }
  const { data: itemRows, error: itemErr } = await supabase
    .schema(SCHEMA)
    .from("kb_source_items")
    .select("inbox_item_id, source_id")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .in("inbox_item_id", inboxIds)
    .order("updated_at", { ascending: false });
  if (itemErr) {
    throw new Error(`Failed to load inbox KB source links: ${itemErr.message}`);
  }
  const rows = (itemRows ?? []) as Array<{
    inbox_item_id: string | null;
    source_id: string;
  }>;
  const firstByInbox = new Map<string, string>();
  for (const r of rows) {
    const iid = r.inbox_item_id;
    if (iid && !firstByInbox.has(iid)) {
      firstByInbox.set(iid, String(r.source_id));
    }
  }
  if (firstByInbox.size === 0) {
    return out;
  }
  const sourceIds = [...new Set(firstByInbox.values())];
  const { data: sourceRows, error: srcErr } = await supabase
    .schema(SCHEMA)
    .from("kb_sources")
    .select("id, adapter_id")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .in("id", sourceIds);
  if (srcErr) {
    throw new Error(
      `Failed to load KB sources for inbox links: ${srcErr.message}`
    );
  }
  const adapterBySource = new Map<string, string>();
  for (const s of sourceRows ?? []) {
    const rec = s as { id: string; adapter_id: string };
    adapterBySource.set(String(rec.id), String(rec.adapter_id));
  }
  for (const [inboxId, sourceId] of firstByInbox) {
    const adapter_id = adapterBySource.get(sourceId);
    if (adapter_id) {
      out.set(inboxId, { kb_source_id: sourceId, adapter_id });
    }
  }
  return out;
}

function mergeInboxLinks(
  items: InboxItem[],
  links: Map<string, InboxKbSourceLink>
): InboxItem[] {
  return items.map((item) => {
    const link = links.get(item.id);
    if (!link) {
      return item;
    }
    return {
      ...item,
      linked_kb_source_id: link.kb_source_id,
      linked_adapter_id: link.adapter_id,
    };
  });
}

async function attachInboxKbSourceLink(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  item: InboxItem
): Promise<InboxItem> {
  const links = await loadInboxKbSourceLinks(supabase, tenantId, scopeId, [
    item.id,
  ]);
  return mergeInboxLinks([item], links)[0] ?? item;
}

function rowToActivityLog(row: Record<string, unknown>): KbActivityLogEntry {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    kb_id: row.kb_id ? String(row.kb_id) : null,
    event_type: String(row.event_type),
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {},
    actor_id: row.actor_id ? String(row.actor_id) : null,
    created_at: String(row.created_at),
  };
}

export function createInboxRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
): InboxRepo {
  const tbl = () => supabase.schema(SCHEMA).from("inbox_items");

  return {
    async create(
      input: InboxItemInput,
      actorPrincipalId?: string | null
    ): Promise<InboxItem> {
      const id = uuidv7();
      const now = new Date().toISOString();
      const principal = actorPrincipalId?.trim() || null;
      const { data, error } = await tbl()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          kb_id: input.kb_id,
          title: input.title,
          source_type: input.source_type,
          source_url: input.source_url ?? null,
          raw_markdown: input.raw_markdown ?? null,
          raw_text: input.raw_text ?? null,
          metadata: input.metadata ?? {},
          original_storage_path: input.original_storage_path ?? null,
          created_by: principal,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create inbox item: ${error.message}`);
      }
      const created = rowToInboxItem(data as Record<string, unknown>);
      return attachInboxKbSourceLink(supabase, tenantId, scopeId, created);
    },

    async getById(id: string): Promise<InboxItem | null> {
      const { data, error } = await tbl()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      if (!data) {
        return null;
      }
      const item = rowToInboxItem(data as Record<string, unknown>);
      return attachInboxKbSourceLink(supabase, tenantId, scopeId, item);
    },

    async listPaginated(
      params: InboxQueryParams
    ): Promise<PaginatedResponse<InboxItem>> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.page_size ?? 25, 1), 200);
      const ascending = (params.sort_order ?? "desc") === "asc";
      const sortCol =
        params.sort_by === "title"
          ? "title"
          : params.sort_by === "status"
            ? "status"
            : params.sort_by === "updated_at"
              ? "updated_at"
              : "captured_at";

      let q = tbl()
        .select("*", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("kb_id", params.kb_id);

      if (params.status) {
        q = q.eq("status", params.status);
      }
      if (params.search?.trim()) {
        const term = `%${params.search.trim()}%`;
        q = q.ilike("title", term);
      }

      const from = (page - 1) * pageSize;
      const { data, error, count } = await q
        .order(sortCol, { ascending })
        .range(from, from + pageSize - 1);

      if (error) {
        throw new Error(`Failed to list inbox: ${error.message}`);
      }
      const rows = (data ?? []) as Record<string, unknown>[];
      const items = rows.map(rowToInboxItem);
      const links = await loadInboxKbSourceLinks(
        supabase,
        tenantId,
        scopeId,
        items.map((i) => i.id)
      );
      return {
        data: mergeInboxLinks(items, links),
        total: count ?? 0,
        page,
        page_size: pageSize,
      };
    },

    async update(
      id: string,
      input: InboxItemUpdateInput
    ): Promise<InboxItem | null> {
      const patch: Record<string, unknown> = {
        ...input,
        updated_at: new Date().toISOString(),
      };
      if (input.metadata !== undefined) {
        patch.metadata = input.metadata;
      }
      if (input.triage_metadata !== undefined) {
        patch.triage_metadata = input.triage_metadata;
      }
      const { data, error } = await tbl()
        .update(patch)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to update inbox item: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      const updated = rowToInboxItem(data as Record<string, unknown>);
      return attachInboxKbSourceLink(supabase, tenantId, scopeId, updated);
    },

    async delete(id: string): Promise<boolean> {
      const { error } = await tbl()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) {
        throw new Error(error.message);
      }
      return true;
    },
  };
}

export function createSourceReferenceRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
): SourceReferenceRepo {
  const tbl = () => supabase.schema(SCHEMA).from("source_references");

  return {
    async create(
      input: Pick<
        SourceReference,
        | "article_id"
        | "faq_id"
        | "inbox_item_id"
        | "excerpt"
        | "locator"
        | "source_url"
        | "original_storage_path"
      >
    ): Promise<SourceReference> {
      if (!(input.article_id || input.faq_id)) {
        throw new Error("source_references requires article_id or faq_id");
      }
      if (input.article_id && input.faq_id) {
        throw new Error(
          "source_references cannot set both article_id and faq_id"
        );
      }
      const id = uuidv7();
      const now = new Date().toISOString();
      const { data, error } = await tbl()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          article_id: input.article_id,
          faq_id: input.faq_id,
          inbox_item_id: input.inbox_item_id ?? null,
          excerpt: input.excerpt ?? null,
          locator: input.locator ?? null,
          source_url: input.source_url ?? null,
          original_storage_path: input.original_storage_path ?? null,
          created_at: now,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create source reference: ${error.message}`);
      }
      const row = data as Record<string, unknown>;
      return {
        id: String(row.id),
        tenant_id: String(row.tenant_id),
        scope_id: String(row.scope_id),
        article_id: row.article_id ? String(row.article_id) : null,
        faq_id: row.faq_id ? String(row.faq_id) : null,
        inbox_item_id: row.inbox_item_id ? String(row.inbox_item_id) : null,
        excerpt: row.excerpt == null ? null : String(row.excerpt),
        locator: row.locator == null ? null : String(row.locator),
        source_url: row.source_url == null ? null : String(row.source_url),
        original_storage_path: row.original_storage_path
          ? String(row.original_storage_path)
          : null,
        created_at: String(row.created_at),
      };
    },

    async deleteByInboxAndArticle(
      inboxItemId: string,
      articleId: string
    ): Promise<void> {
      const { error } = await tbl()
        .delete()
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("inbox_item_id", inboxItemId)
        .eq("article_id", articleId);
      if (error) {
        throw new Error(`Failed to delete source reference: ${error.message}`);
      }
    },

    async listByArticle(articleId: string): Promise<SourceReference[]> {
      const { data, error } = await tbl()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("article_id", articleId)
        .order("created_at", { ascending: false });
      if (error) {
        throw new Error(error.message);
      }
      return (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id),
          tenant_id: String(row.tenant_id),
          scope_id: String(row.scope_id),
          article_id: row.article_id ? String(row.article_id) : null,
          faq_id: row.faq_id ? String(row.faq_id) : null,
          inbox_item_id: row.inbox_item_id ? String(row.inbox_item_id) : null,
          excerpt: row.excerpt == null ? null : String(row.excerpt),
          locator: row.locator == null ? null : String(row.locator),
          source_url: row.source_url == null ? null : String(row.source_url),
          original_storage_path: row.original_storage_path
            ? String(row.original_storage_path)
            : null,
          created_at: String(row.created_at),
        };
      });
    },
  };
}

export function createKbActivityLogRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
): KbActivityLogRepo {
  const tbl = () => supabase.schema(SCHEMA).from("kb_activity_log");

  return {
    async append(entry: {
      kb_id?: string | null;
      event_type: string;
      payload?: Record<string, unknown>;
      actor_id?: string | null;
    }): Promise<KbActivityLogEntry> {
      const id = uuidv7();
      const now = new Date().toISOString();
      const { data, error } = await tbl()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          kb_id: entry.kb_id ?? null,
          event_type: entry.event_type,
          payload: entry.payload ?? {},
          actor_id: entry.actor_id ?? null,
          created_at: now,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to append activity log: ${error.message}`);
      }
      return rowToActivityLog(data as Record<string, unknown>);
    },

    async listPaginated(params: {
      kb_id?: string;
      page?: number;
      page_size?: number;
    }): Promise<PaginatedResponse<KbActivityLogEntry>> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.page_size ?? 25, 1), 200);
      let q = tbl()
        .select("*", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (params.kb_id) {
        q = q.eq("kb_id", params.kb_id);
      }
      const from = (page - 1) * pageSize;
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) {
        throw new Error(error.message);
      }
      const rows = (data ?? []) as Record<string, unknown>[];
      return {
        data: rows.map(rowToActivityLog),
        total: count ?? 0,
        page,
        page_size: pageSize,
      };
    },
  };
}
