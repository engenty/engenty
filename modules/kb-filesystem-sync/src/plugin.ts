/**
 * KB Filesystem Sync — backend plugin entry.
 *
 * Mirrors the database-backed Knowledge Base to a file-storage bucket using
 * the Open Knowledge Format. It observes `knowledge-base.{article,category,kb}`
 * events for incremental sync and exposes manual export/import/status routes.
 */

import { createKbRepoFactory } from "@engenty/knowledge-base/dal/supabase";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerKbSyncApi } from "./api/index.js";
import { kbBasePrefix, resolveKbSyncConfig } from "./config.js";
import {
  syncArticleDelete,
  syncArticleUpsert,
  syncCategoryDelete,
  syncCategoryUpsert,
  syncKbDelete,
  syncKbUpsert,
} from "./services/sync-service.js";

const logger = createLogger({ name: "kb-filesystem-sync" });

interface EntityPayload {
  article_id?: string;
  category_id?: string;
  kb_id?: string;
  scope_id?: string;
  tenant_id: string;
}

const registerKbFilesystemSyncPlugin: EngentyPluginFactory = (engenty) => {
  const { config, events, server } = engenty;
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): every read/write runs
  // on a tenant-locked handle (engenty_server lane, RLS-enforced). HTTP routes
  // resolve it from ctx.auth; event handlers resolve it from the payload's own
  // tenant_id (all knowledge-base.* events are tenantScoped). No context-less
  // lane remains, so the service-role client is not captured at all.
  const getTenantDb = server.getTenantDb;
  if (!getTenantDb) {
    throw new Error(
      "KB Filesystem Sync requires the tenant-locked database seam"
    );
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;

  const syncConfig = resolveKbSyncConfig(config.pluginConfig);
  const storage = server.getStorageService?.(syncConfig.bucket) ?? null;
  if (!storage) {
    logger.warn("Storage service unavailable; KB filesystem sync is disabled", {
      bucket: syncConfig.bucket,
    });
    return;
  }

  const repoFactory = (tenantId: string, scopeId: string) =>
    createKbRepoFactory(getDb({ tenantId }), tenantId, scopeId);

  registerKbSyncApi(server, {
    config: syncConfig,
    getDb,
    repoFactory,
    storage,
  });

  // Resolve the per-(tenant, kb) sync context for an event payload.
  const contextFor = (p: EntityPayload, kbId: string) => ({
    base: kbBasePrefix(syncConfig, p.tenant_id, kbId),
    repos: repoFactory(p.tenant_id, p.scope_id ?? p.tenant_id),
    storage,
  });

  // Handlers must never throw — a failed sync write should not roll back the
  // originating KB transaction. Errors are logged and swallowed.
  const guard =
    (name: string, fn: (p: EntityPayload) => Promise<void>) =>
    async (payload: EntityPayload) => {
      try {
        await fn(payload);
      } catch (error) {
        logger.error("KB filesystem sync handler failed", {
          event: name,
          error,
        });
      }
    };

  // The events runtime awaits observers inline, and the KB repos `await` the
  // emit inside their write path. So the observer MUST return immediately —
  // otherwise the recursive storage scans / uploads below would block (and
  // hold a DB connection on) every KB mutation. We fire-and-forget: the sync
  // runs in the background and never delays or endangers the KB write.
  const on = (name: string, fn: (p: EntityPayload) => Promise<void>) =>
    events.modules.on(
      name,
      (payload) => {
        void guard(name, fn)(payload as unknown as EntityPayload);
      },
      { tenantScoped: true }
    );

  // ── Articles ──
  for (const verb of ["created", "updated"] as const) {
    on(`knowledge-base.article.${verb}`, async (p) => {
      if (p.article_id && p.kb_id) {
        await syncArticleUpsert(contextFor(p, p.kb_id), p.article_id);
      }
    });
  }
  on("knowledge-base.article.deleted", async (p) => {
    if (p.article_id && p.kb_id) {
      await syncArticleDelete(
        { base: kbBasePrefix(syncConfig, p.tenant_id, p.kb_id), storage },
        p.article_id
      );
    }
  });

  // ── Categories ──
  for (const verb of ["created", "updated"] as const) {
    on(`knowledge-base.category.${verb}`, async (p) => {
      if (p.category_id && p.kb_id) {
        await syncCategoryUpsert(
          contextFor(p, p.kb_id),
          p.category_id,
          p.kb_id
        );
      }
    });
  }
  on("knowledge-base.category.deleted", async (p) => {
    if (p.category_id && p.kb_id) {
      await syncCategoryDelete(
        { base: kbBasePrefix(syncConfig, p.tenant_id, p.kb_id), storage },
        p.category_id
      );
    }
  });

  // ── Knowledge bases ──
  for (const verb of ["created", "updated"] as const) {
    on(`knowledge-base.kb.${verb}`, async (p) => {
      if (p.kb_id) {
        await syncKbUpsert(contextFor(p, p.kb_id), p.kb_id);
      }
    });
  }
  on("knowledge-base.kb.deleted", async (p) => {
    if (p.kb_id) {
      await syncKbDelete({
        base: kbBasePrefix(syncConfig, p.tenant_id, p.kb_id),
        storage,
      });
    }
  });

  logger.info("KB filesystem sync enabled", { bucket: syncConfig.bucket });
};

export default registerKbFilesystemSyncPlugin;
