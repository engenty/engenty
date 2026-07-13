import { capabilityCovers, type PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "zod";
import {
  assembleRecord,
  ImportValidationError,
  prepareSource,
} from "../import-service.js";
import {
  discoverImportableSources,
  discoverOAuthFacts,
  registryDiscover,
  registrySearch,
} from "../registry-client.js";
import type { ExternalConnectorsRepo } from "../repo.js";
import type { ImportedConnectorRecord } from "../types.js";

/**
 * Superadmin import console API. Imports are platform-level in v1 (connector
 * definitions are process-global); per-tenant catalogs are an explicit
 * non-goal — see PLAN-external-connectors.md §0.
 */

const searchBody = z.object({
  kind: z.enum(["openapi", "mcp"]).nullish(),
  query: z.string().min(1).max(200),
});

const discoverBody = z.object({
  domain: z.string().min(1).max(253),
});

const previewBody = z.object({
  domain: z.string().min(1).max(253).nullish(),
  source_kind: z.enum(["openapi", "mcp"]),
  source_url: z.string().url(),
});

const importBody = z.object({
  action_filter: z.array(z.string()).max(500).nullish(),
  base_url: z.string().url().nullish(),
  domain: z.string().min(1).max(253),
  id: z.string().min(2).max(60),
  name: z.string().min(1).max(120).nullish(),
  oauth_client_id: z.string().max(500).nullish(),
  oauth_client_secret: z.string().max(500).nullish(),
  source_kind: z.enum(["openapi", "mcp"]),
  source_url: z.string().url(),
  // Matches TOOL_PREFIX_RE (31 chars max) so zod-valid input can't 422 later.
  tool_prefix: z.string().min(2).max(31),
});

const statusBody = z.object({ status: z.enum(["enabled", "disabled"]) });

interface Hono {
  json: (data: unknown, status?: number) => unknown;
}

/** Public projection: never expose encrypted credential columns. */
function projectRecord(record: ImportedConnectorRecord) {
  const { client_id_enc, client_secret_enc, registry_snapshot, ...rest } =
    record;
  return {
    ...rest,
    action_count: record.actions.length,
    has_oauth_client: Boolean(client_id_enc && client_secret_enc),
  };
}

export interface ExternalRoutesDeps {
  /** (Re-)register a record's connector live; returns skipped action ids. */
  registerRecord: (record: ImportedConnectorRecord) => string[];
  removeRecord: (id: string) => void;
  repo: ExternalConnectorsRepo;
}

export function registerExternalConnectorRoutes(
  server: PluginServerApi,
  deps: ExternalRoutesDeps
): void {
  const { registerRecord, removeRecord, repo } = deps;

  const guard = (ctx: {
    auth?: { capabilities?: string[] } | null;
  }): string | null => {
    if (!ctx.auth) {
      return "Unauthorized";
    }
    // In-process callers may omit capabilities — treat absent as not covered.
    if (!capabilityCovers(ctx.auth.capabilities ?? [], "core.superadmin")) {
      return "Forbidden: importing connectors requires superadmin";
    }
    return null;
  };

  server.registerHttpRoute({
    method: "post",
    path: "/api/external-connectors/search",
    summary: "Search the integrations registry for importable services",
    request: { body: searchBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      const denied = guard(ctx);
      if (denied) {
        return hono.json(
          { error: denied },
          denied === "Unauthorized" ? 401 : 403
        );
      }
      const body = ctx.body as z.infer<typeof searchBody>;
      const results = await registrySearch({
        kind: body.kind ?? undefined,
        query: body.query,
      });
      return hono.json({ results });
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/external-connectors/discover",
    summary: "Resolve a registry domain to concrete importable sources",
    request: { body: discoverBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      const denied = guard(ctx);
      if (denied) {
        return hono.json(
          { error: denied },
          denied === "Unauthorized" ? 401 : 403
        );
      }
      const body = ctx.body as z.infer<typeof discoverBody>;
      try {
        const { parsed } = await registryDiscover(body.domain);
        return hono.json({
          domain: parsed.domain,
          oauth_found: Boolean(
            discoverOAuthFacts(parsed)?.authorizationEndpoint
          ),
          sources: discoverImportableSources(parsed),
        });
      } catch (error) {
        return hono.json(
          { error: error instanceof Error ? error.message : String(error) },
          502
        );
      }
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/external-connectors/preview",
    summary: "Dry-run: discover + normalize a source without importing",
    request: { body: previewBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      const denied = guard(ctx);
      if (denied) {
        return hono.json(
          { error: denied },
          denied === "Unauthorized" ? 401 : 403
        );
      }
      const body = ctx.body as z.infer<typeof previewBody>;
      try {
        const [prepared, discover] = await Promise.all([
          prepareSource({
            sourceKind: body.source_kind,
            sourceUrl: body.source_url,
          }),
          body.domain
            ? registryDiscover(body.domain).catch(() => null)
            : Promise.resolve(null),
        ]);
        return hono.json({
          actions: prepared.normalized.actions.map((action) => ({
            classification: action.classification,
            description: action.description.slice(0, 200),
            id: action.id,
            summary: action.summary,
            tags: action.tags,
          })),
          base_url: prepared.normalized.base_url,
          discover_found: Boolean(discover),
          dropped_count: prepared.normalized.dropped_count,
          security_schemes: prepared.normalized.security_schemes,
          skipped: prepared.normalized.skipped,
          title: prepared.normalized.title,
        });
      } catch (error) {
        return hono.json(
          { error: error instanceof Error ? error.message : String(error) },
          422
        );
      }
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/external-connectors/import",
    summary: "Import a source as a live connector",
    request: { body: importBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      const denied = guard(ctx);
      if (denied) {
        return hono.json(
          { error: denied },
          denied === "Unauthorized" ? 401 : 403
        );
      }
      const body = ctx.body as z.infer<typeof importBody>;
      if (await repo.get(body.id)) {
        return hono.json(
          { error: `connector "${body.id}" already imported` },
          409
        );
      }
      try {
        const [prepared, discovered] = await Promise.all([
          prepareSource({
            sourceKind: body.source_kind,
            sourceUrl: body.source_url,
          }),
          registryDiscover(body.domain).catch(() => null),
        ]);
        const { record, warnings } = assembleRecord({
          actionFilter: body.action_filter ?? null,
          baseUrlOverride: body.base_url ?? null,
          discover: discovered?.parsed ?? null,
          domain: body.domain,
          id: body.id,
          importedBy: ctx.auth?.principalId ?? "unknown",
          name: body.name ?? null,
          oauthClient:
            body.oauth_client_id && body.oauth_client_secret
              ? {
                  clientId: body.oauth_client_id,
                  clientSecret: body.oauth_client_secret,
                }
              : null,
          prepared,
          rawDiscover: discovered?.raw ?? null,
          sourceKind: body.source_kind,
          sourceUrl: body.source_url,
          toolPrefix: body.tool_prefix,
        });
        await repo.insert(record);
        const skippedActions = registerRecord(record);
        await ctx.recordAuditEvent?.({
          detail: {
            action_count: record.actions.length,
            connector_id: record.id,
            domain: record.domain,
            source_kind: record.source_kind,
          },
          type: "external_connector.imported",
        });
        return hono.json({
          connector: projectRecord(record),
          skipped_actions: skippedActions,
          warnings,
        });
      } catch (error) {
        const status = error instanceof ImportValidationError ? 422 : 502;
        return hono.json(
          { error: error instanceof Error ? error.message : String(error) },
          status
        );
      }
    },
  });

  server.registerHttpRoute({
    method: "get",
    path: "/api/external-connectors",
    summary: "List imported connectors",
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      const denied = guard(ctx);
      if (denied) {
        return hono.json(
          { error: denied },
          denied === "Unauthorized" ? 401 : 403
        );
      }
      const records = await repo.list();
      return hono.json({ connectors: records.map(projectRecord) });
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/external-connectors/:id/refresh",
    summary: "Re-fetch the source and update the connector's actions",
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      const denied = guard(ctx);
      if (denied) {
        return hono.json(
          { error: denied },
          denied === "Unauthorized" ? 401 : 403
        );
      }
      const id = (ctx.params as Record<string, string>).id;
      const record = await repo.get(id);
      if (!record) {
        return hono.json({ error: "not found" }, 404);
      }
      try {
        const prepared = await prepareSource({
          sourceKind: record.source_kind,
          sourceUrl: record.source_url,
        });
        const before = new Set(record.actions.map((a) => a.id));
        const after = new Set(prepared.normalized.actions.map((a) => a.id));
        const added = [...after].filter((a) => !before.has(a));
        const removed = [...before].filter((a) => !after.has(a));
        const updated: ImportedConnectorRecord = {
          ...record,
          actions: prepared.normalized.actions,
          base_url: record.base_url ?? prepared.normalized.base_url,
          refreshed_at: new Date().toISOString(),
          spec_hash: prepared.spec_hash,
        };
        await repo.update(id, {
          actions: updated.actions,
          base_url: updated.base_url,
          refreshed_at: updated.refreshed_at,
          spec_hash: updated.spec_hash,
        });
        const skippedActions = registerRecord(updated);
        await ctx.recordAuditEvent?.({
          detail: { added, connector_id: id, removed },
          type: "external_connector.refreshed",
        });
        return hono.json({
          added,
          connector: projectRecord(updated),
          removed,
          // New actions register live; changed schemas and removed actions
          // fully settle on the next core restart (operations are add-only).
          restart_recommended: removed.length > 0,
          skipped_actions: skippedActions,
        });
      } catch (error) {
        return hono.json(
          { error: error instanceof Error ? error.message : String(error) },
          502
        );
      }
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/external-connectors/:id/status",
    summary: "Enable or disable an imported connector",
    request: { body: statusBody },
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      const denied = guard(ctx);
      if (denied) {
        return hono.json(
          { error: denied },
          denied === "Unauthorized" ? 401 : 403
        );
      }
      const id = (ctx.params as Record<string, string>).id;
      const body = ctx.body as z.infer<typeof statusBody>;
      const record = await repo.get(id);
      if (!record) {
        return hono.json({ error: "not found" }, 404);
      }
      await repo.setStatus(id, body.status);
      if (body.status === "disabled") {
        removeRecord(id);
      } else {
        registerRecord({ ...record, status: "enabled" });
      }
      return hono.json({ ok: true, status: body.status });
    },
  });

  server.registerHttpRoute({
    method: "post",
    path: "/api/external-connectors/:id/delete",
    summary: "Remove an imported connector",
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      const denied = guard(ctx);
      if (denied) {
        return hono.json(
          { error: denied },
          denied === "Unauthorized" ? 401 : 403
        );
      }
      const id = (ctx.params as Record<string, string>).id;
      const record = await repo.get(id);
      if (!record) {
        return hono.json({ error: "not found" }, 404);
      }
      await repo.delete(id);
      removeRecord(id);
      await ctx.recordAuditEvent?.({
        detail: { connector_id: id },
        type: "external_connector.deleted",
      });
      return hono.json({ ok: true, restart_recommended: true });
    },
  });
}
