/**
 * Manual trigger + diagnostics routes for KB filesystem sync.
 *
 *   POST /api/kb-sync/export   dump a KB to storage
 *   POST /api/kb-sync/import   reconstruct a KB from storage
 *   GET  /api/kb-sync/status   compare DB vs storage for a KB
 */

import type { KbRepoFactory } from "@engenty/knowledge-base/dal/contracts";
import type {
  PluginAuthContext,
  PluginHttpRouteContext,
  PluginServerApi,
  StorageService,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import { type KbSyncConfig, kbBasePrefix } from "../config.js";
import { createOkfStore } from "../db/okf-store.js";
import { isIndexKey } from "../okf/paths.js";
import { exportKb } from "../services/export.js";
import { importKb } from "../services/import.js";
import { walkKeys } from "../storage/storage-ops.js";

export interface KbSyncApiDeps {
  config: KbSyncConfig;
  /** Tenant-locked DB handle factory (engenty_server lane, RLS-enforced) —
   * resolved per request from the caller's auth. */
  getDb: (auth: { tenantId: string }) => unknown;
  repoFactory: (tenantId: string, scopeId: string) => KbRepoFactory;
  storage: StorageService;
}

const kbIdBody = z.object({ kb_id: z.string().min(1) });
const kbIdQuery = z.object({ kb_id: z.string().min(1) });

function requireAuth(ctx: PluginHttpRouteContext): PluginAuthContext {
  if (!ctx.auth) {
    throw new Error("Authentication required");
  }
  return ctx.auth;
}

export function registerKbSyncApi(
  server: Pick<PluginServerApi, "registerHttpRoute">,
  deps: KbSyncApiDeps
): void {
  const { config, repoFactory, storage } = deps;

  server.registerHttpRoute({
    method: "post",
    path: "/api/kb-sync/export",
    summary: "Export a knowledge base to OKF files",
    tags: ["kb-sync"],
    request: { body: kbIdBody },
    operation: {
      moduleId: "kb-filesystem-sync",
      requiredCapabilities: ["module.kb-filesystem-sync.write"],
      riskLevel: "low",
      idempotent: true,
    },
    handler: async (ctx) => {
      const auth = requireAuth(ctx);
      const { kb_id } = kbIdBody.parse(ctx.body);
      const base = kbBasePrefix(config, auth.tenantId, kb_id);
      const repos = repoFactory(auth.tenantId, auth.scopeId);
      return await exportKb({ base, repos, storage }, kb_id);
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/kb-sync/import",
    summary: "Import a knowledge base from OKF files",
    tags: ["kb-sync"],
    request: { body: kbIdBody },
    operation: {
      moduleId: "kb-filesystem-sync",
      requiredCapabilities: ["module.kb-filesystem-sync.write"],
      riskLevel: "medium",
      idempotent: true,
    },
    handler: async (ctx) => {
      const auth = requireAuth(ctx);
      const { kb_id } = kbIdBody.parse(ctx.body);
      const base = kbBasePrefix(config, auth.tenantId, kb_id);
      const store = createOkfStore(
        deps.getDb(auth),
        auth.tenantId,
        auth.scopeId
      );
      return await importKb({ base, storage, store }, kb_id);
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/kb-sync/status",
    summary: "Compare DB and storage state for a knowledge base",
    tags: ["kb-sync"],
    request: { query: kbIdQuery },
    operation: {
      moduleId: "kb-filesystem-sync",
      requiredCapabilities: ["module.kb-filesystem-sync.read"],
      riskLevel: "low",
      idempotent: true,
    },
    handler: async (ctx) => {
      const auth = requireAuth(ctx);
      const { kb_id } = kbIdQuery.parse(ctx.query);
      const base = kbBasePrefix(config, auth.tenantId, kb_id);
      const repos = repoFactory(auth.tenantId, auth.scopeId);

      const kb = await repos.kb.getById(kb_id);
      const categories = await repos.categories.list(kb_id);
      const articlePage = await repos.articles.listPaginated({
        kb_id,
        page: 1,
        page_size: 1,
      });
      const keys = await walkKeys(storage, base);
      const indexFiles = keys.filter((k) => isIndexKey(k)).length;
      const storedArticles = keys.filter(
        (k) => k.endsWith(".md") && !isIndexKey(k)
      ).length;

      const db = {
        kb_exists: Boolean(kb),
        categories: categories.length,
        articles: articlePage.total,
      };
      const fs = {
        kb_index: keys.includes(`${base}/index.md`),
        categories: Math.max(indexFiles - 1, 0),
        articles: storedArticles,
      };
      return {
        kb_id,
        db,
        storage: fs,
        in_sync:
          db.kb_exists === fs.kb_index &&
          db.categories === fs.categories &&
          db.articles === fs.articles,
      };
    },
  });
}
