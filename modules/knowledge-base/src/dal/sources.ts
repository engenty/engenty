import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import type { KbSourceRepo } from "./contracts.js";
import { SCHEMA } from "./shared.js";
import {
  rowToSource,
  rowToSourceItem,
  rowToSourceItemLink,
  rowToSourceItemMedia,
  rowToSourceItemSection,
  rowToSourceRun,
} from "./source-mappers.js";

export function createKbSourceRepo(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
): KbSourceRepo {
  const sources = () => supabase.schema(SCHEMA).from("kb_sources");
  const items = () => supabase.schema(SCHEMA).from("kb_source_items");
  const runs = () => supabase.schema(SCHEMA).from("kb_source_runs");
  const sections = () =>
    supabase.schema(SCHEMA).from("kb_source_item_sections");
  const media = () => supabase.schema(SCHEMA).from("kb_source_item_media");
  const links = () => supabase.schema(SCHEMA).from("kb_source_item_links");

  return {
    async create(input, actorPrincipalId) {
      const id = uuidv7();
      const now = new Date().toISOString();
      const { data, error } = await sources()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          kb_id: input.kb_id,
          adapter_id: input.adapter_id,
          name: input.name,
          settings: input.settings ?? {},
          schedule: input.schedule,
          enabled: input.enabled,
          status: input.status,
          missing_item_strategy: input.missing_item_strategy,
          webhook_token_hash: input.webhook_token_hash ?? null,
          next_run_at: input.next_run_at ?? null,
          created_by: actorPrincipalId?.trim() || null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create KB source: ${error.message}`);
      }
      return rowToSource(data as Record<string, unknown>);
    },

    async createRun(input) {
      const id = uuidv7();
      const now = new Date().toISOString();
      const { data, error } = await runs()
        .insert({
          id,
          tenant_id: tenantId,
          scope_id: scopeId,
          kb_id: input.kb_id,
          source_id: input.source_id,
          trigger: input.trigger,
          status: input.status,
          created_items: input.created_items,
          updated_items: input.updated_items,
          skipped_items: input.skipped_items,
          error: input.error,
          metadata: input.metadata,
          started_at: now,
          completed_at: input.completed_at,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create KB source run: ${error.message}`);
      }
      return rowToSourceRun(data as Record<string, unknown>);
    },

    async delete(id) {
      const { error } = await sources()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to delete KB source: ${error.message}`);
      }
      return true;
    },

    async getById(id) {
      const { data, error } = await sources()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get KB source: ${error.message}`);
      }
      return data ? rowToSource(data as Record<string, unknown>) : null;
    },

    async getByWebhookTokenHash(tokenHash) {
      const { data, error } = await sources()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("webhook_token_hash", tokenHash)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get KB source by webhook: ${error.message}`);
      }
      return data ? rowToSource(data as Record<string, unknown>) : null;
    },

    async getRunById(id) {
      const { data, error } = await runs()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get KB source run: ${error.message}`);
      }
      return data ? rowToSourceRun(data as Record<string, unknown>) : null;
    },

    async getRunningRun(sourceId) {
      const { data, error } = await runs()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("source_id", sourceId)
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get running source run: ${error.message}`);
      }
      return data ? rowToSourceRun(data as Record<string, unknown>) : null;
    },

    async getSourceItemById(id) {
      const { data, error } = await items()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get KB source item: ${error.message}`);
      }
      return data ? rowToSourceItem(data as Record<string, unknown>) : null;
    },

    async getSourceItemByKey(sourceId, adapterItemKey) {
      const { data, error } = await items()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("source_id", sourceId)
        .eq("adapter_item_key", adapterItemKey)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get KB source item: ${error.message}`);
      }
      return data ? rowToSourceItem(data as Record<string, unknown>) : null;
    },

    async findSourceItemBySourceUrl(kbId, sourceUrl) {
      const trimmed = sourceUrl.trim();
      if (!trimmed) {
        return null;
      }
      const { data, error } = await items()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("kb_id", kbId)
        .eq("source_url", trimmed)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(
          `Failed to find KB source item by URL: ${error.message}`
        );
      }
      return data ? rowToSourceItem(data as Record<string, unknown>) : null;
    },

    async findSourceItemByInboxItemId(inboxItemId) {
      const trimmed = inboxItemId.trim();
      if (!trimmed) {
        return null;
      }
      const { data, error } = await items()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("inbox_item_id", trimmed)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(
          `Failed to find KB source item by inbox id: ${error.message}`
        );
      }
      return data ? rowToSourceItem(data as Record<string, unknown>) : null;
    },

    async listSourceItemLinks(sourceItemId) {
      const { data, error } = await links()
        .select("*")
        .eq("source_item_id", sourceItemId)
        .order("position", { ascending: true });
      if (error) {
        throw new Error(
          `Failed to list KB source item links: ${error.message}`
        );
      }
      return ((data ?? []) as Record<string, unknown>[]).map(
        rowToSourceItemLink
      );
    },

    async listSourceItemMedia(sourceItemId) {
      const { data, error } = await media()
        .select("*")
        .eq("source_item_id", sourceItemId)
        .order("position", { ascending: true });
      if (error) {
        throw new Error(
          `Failed to list KB source item media: ${error.message}`
        );
      }
      return ((data ?? []) as Record<string, unknown>[]).map(
        rowToSourceItemMedia
      );
    },

    async listSourceItemSections(sourceItemId) {
      const { data, error } = await sections()
        .select("*")
        .eq("source_item_id", sourceItemId)
        .order("position", { ascending: true });
      if (error) {
        throw new Error(
          `Failed to list KB source item sections: ${error.message}`
        );
      }
      return ((data ?? []) as Record<string, unknown>[]).map(
        rowToSourceItemSection
      );
    },

    async listDue(nowIso, limit = 25) {
      const { data, error } = await sources()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("enabled", true)
        .lte("next_run_at", nowIso)
        .order("next_run_at", { ascending: true })
        .limit(limit);
      if (error) {
        throw new Error(`Failed to list due KB sources: ${error.message}`);
      }
      return ((data ?? []) as Record<string, unknown>[]).map(rowToSource);
    },

    async listItemsPaginated(sourceId, params) {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.page_size ?? 50, 1), 200);
      let q = items()
        .select("*", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("source_id", sourceId);
      if (params.status) {
        q = q.eq("status", params.status);
      }
      if (params.search?.trim()) {
        const search = params.search.trim().replaceAll(",", " ");
        q = q.or(
          `title.ilike.%${search}%,source_url.ilike.%${search}%,adapter_item_key.ilike.%${search}%`
        );
      }
      const from = (page - 1) * pageSize;
      const { data, error, count } = await q
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) {
        throw new Error(`Failed to list KB source items: ${error.message}`);
      }
      return {
        data: ((data ?? []) as Record<string, unknown>[]).map(rowToSourceItem),
        page,
        page_size: pageSize,
        total: count ?? 0,
      };
    },

    async listPaginated(params) {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.page_size ?? 25, 1), 200);
      const ascending = (params.sort_order ?? "desc") === "asc";
      const sortCol =
        params.sort_by === "name"
          ? "name"
          : params.sort_by === "created_at"
            ? "created_at"
            : params.sort_by === "last_run_at"
              ? "last_run_at"
              : params.sort_by === "next_run_at"
                ? "next_run_at"
                : "updated_at";
      let q = sources()
        .select("*", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("kb_id", params.kb_id);
      if (params.status) {
        q = q.eq("status", params.status);
      }
      if (params.search?.trim()) {
        q = q.ilike("name", `%${params.search.trim()}%`);
      }
      const from = (page - 1) * pageSize;
      const { data, error, count } = await q
        .order(sortCol, { ascending })
        .range(from, from + pageSize - 1);
      if (error) {
        throw new Error(`Failed to list KB sources: ${error.message}`);
      }
      return {
        data: ((data ?? []) as Record<string, unknown>[]).map(rowToSource),
        page,
        page_size: pageSize,
        total: count ?? 0,
      };
    },

    async listRecentRuns(sourceId, limit = 10) {
      const { data, error } = await runs()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("source_id", sourceId)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`Failed to list KB source runs: ${error.message}`);
      }
      return ((data ?? []) as Record<string, unknown>[]).map(rowToSourceRun);
    },

    async deleteSourceItem(id) {
      const { error } = await items()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to delete KB source item: ${error.message}`);
      }
      return true;
    },

    async deleteRunsForSource(sourceId) {
      const { error } = await runs()
        .delete()
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("source_id", sourceId);
      if (error) {
        throw new Error(`Failed to delete KB source runs: ${error.message}`);
      }
    },

    async update(id, input) {
      const { data, error } = await sources()
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to update KB source: ${error.message}`);
      }
      return data ? rowToSource(data as Record<string, unknown>) : null;
    },

    async updateRun(id, input) {
      const { data, error } = await runs()
        .update(input)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to update KB source run: ${error.message}`);
      }
      return data ? rowToSourceRun(data as Record<string, unknown>) : null;
    },

    async updateSourceItem(id, input) {
      const { data, error } = await items()
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select()
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to update KB source item: ${error.message}`);
      }
      return data ? rowToSourceItem(data as Record<string, unknown>) : null;
    },

    async replaceSourceItemLinks(sourceItemId, inputLinks) {
      const { error: deleteError } = await links()
        .delete()
        .eq("source_item_id", sourceItemId);
      if (deleteError) {
        throw new Error(
          `Failed to replace KB source item links: ${deleteError.message}`
        );
      }
      if (inputLinks.length === 0) {
        return [];
      }
      const { data, error } = await links()
        .insert(
          inputLinks.map((link) => ({
            id: uuidv7(),
            source_item_id: sourceItemId,
            href: link.href,
            normalized_href: link.normalized_href,
            link_type: link.link_type,
            text: link.text ?? null,
            title: link.title ?? null,
            rel: link.rel ?? null,
            position: link.position,
            metadata: link.metadata ?? {},
          }))
        )
        .select()
        .order("position", { ascending: true });
      if (error) {
        throw new Error(
          `Failed to insert KB source item links: ${error.message}`
        );
      }
      return ((data ?? []) as Record<string, unknown>[]).map(
        rowToSourceItemLink
      );
    },

    async replaceSourceItemMedia(sourceItemId, inputMedia) {
      const { error: deleteError } = await media()
        .delete()
        .eq("source_item_id", sourceItemId);
      if (deleteError) {
        throw new Error(
          `Failed to replace KB source item media: ${deleteError.message}`
        );
      }
      if (inputMedia.length === 0) {
        return [];
      }
      const { data, error } = await media()
        .insert(
          inputMedia.map((m) => ({
            id: uuidv7(),
            source_item_id: sourceItemId,
            source_url: m.source_url,
            storage_object_key: m.storage_object_key ?? null,
            media_type: m.media_type,
            content_type: m.content_type ?? null,
            title: m.title ?? null,
            description: m.description ?? null,
            alt_text: m.alt_text ?? null,
            width: m.width ?? null,
            height: m.height ?? null,
            size_bytes: m.size_bytes ?? null,
            content_hash: m.content_hash ?? null,
            position: m.position,
            metadata: m.metadata ?? {},
            download_status: m.download_status,
          }))
        )
        .select()
        .order("position", { ascending: true });
      if (error) {
        throw new Error(
          `Failed to insert KB source item media: ${error.message}`
        );
      }
      return ((data ?? []) as Record<string, unknown>[]).map(
        rowToSourceItemMedia
      );
    },

    async replaceSourceItemSections(sourceItemId, inputSections) {
      const { error: deleteError } = await sections()
        .delete()
        .eq("source_item_id", sourceItemId);
      if (deleteError) {
        throw new Error(
          `Failed to replace KB source item sections: ${deleteError.message}`
        );
      }
      if (inputSections.length === 0) {
        return [];
      }
      const { data, error } = await sections()
        .insert(
          inputSections.map((section) => ({
            id: uuidv7(),
            source_item_id: sourceItemId,
            kind: section.kind,
            title: section.title ?? null,
            locator: section.locator ?? null,
            position: section.position,
            content: section.content,
            metadata: section.metadata ?? {},
          }))
        )
        .select()
        .order("position", { ascending: true });
      if (error) {
        throw new Error(
          `Failed to insert KB source item sections: ${error.message}`
        );
      }
      return ((data ?? []) as Record<string, unknown>[]).map(
        rowToSourceItemSection
      );
    },

    async upsertSourceItem(input) {
      const now = new Date().toISOString();
      const existing = await this.getSourceItemByKey(
        input.source_id,
        input.adapter_item_key
      );
      if (existing) {
        const { data, error } = await items()
          .update({
            title: input.title,
            source_url: input.source_url,
            locator: input.locator,
            metadata: input.metadata,
            content_hash: input.content_hash,
            status: input.status,
            inbox_item_id: input.inbox_item_id,
            last_seen_at: input.last_seen_at,
            missing_since: input.missing_since,
            updated_at: now,
          })
          .eq("id", existing.id)
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .select()
          .single();
        if (error) {
          throw new Error(`Failed to update KB source item: ${error.message}`);
        }
        return rowToSourceItem(data as Record<string, unknown>);
      }

      const { data, error } = await items()
        .insert({
          tenant_id: tenantId,
          scope_id: scopeId,
          id: uuidv7(),
          kb_id: input.kb_id,
          source_id: input.source_id,
          adapter_item_key: input.adapter_item_key,
          title: input.title,
          source_url: input.source_url,
          locator: input.locator,
          metadata: input.metadata,
          content_hash: input.content_hash,
          status: input.status,
          inbox_item_id: input.inbox_item_id,
          last_seen_at: input.last_seen_at,
          missing_since: input.missing_since,
          updated_at: now,
        })
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to create KB source item: ${error.message}`);
      }
      return rowToSourceItem(data as Record<string, unknown>);
    },
  };
}
