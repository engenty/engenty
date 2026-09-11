import { capabilityCovers, type PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "zod";
import { ImportValidationError } from "../errors.js";
import {
  assembleRecord,
  connectorIdFromSlug,
  prepareSource,
  resolveRequiredHeaders,
  toolPrefixFromSlug,
} from "../import-service.js";
import {
  discoverImportableSources,
  discoverOAuthFacts,
  type ImportableSource,
  type RegistrySurface,
  registryDiscover,
  registrySearch,
  resolveMcpTransport,
} from "../registry-client.js";
import { resolveRegistrySource } from "../registry-source.js";
import type { ExternalConnectorsRepo } from "../repo.js";
import type { ImportedConnectorRecord } from "../types.js";

/**
 * Superadmin import console API. Imports are platform-level in v1 (connector
 * definitions are process-global); per-tenant catalogs are an explicit
 * non-goal — see PLAN-external-connectors.md §0.
 *
 * Registry metadata that decides what gets imported — surface slug, spec
 * overrides, required headers, transport — is re-resolved here from `domain`
 * plus `source_url`. The client never gets to hand it in.
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

/** Surface facts the console renders next to a source. */
function projectSurface(surface: RegistrySurface) {
  return {
    auth_status: surface.auth.status,
    connect_url: surface.connect_url,
    docs: surface.docs,
    kind: surface.kind,
    name: surface.name,
    required_headers: surface.required_headers.map((header) => ({
      description: header.description ?? null,
      name: header.name,
      source_kind: header.source?.kind ?? "unknown",
      value: header.source?.value ?? null,
    })),
    slug: surface.slug,
    spec: surface.spec,
    spec_alternates: surface.spec_alternates,
    spec_override_count: surface.spec_overrides.length,
    suggested_id: connectorIdFromSlug(surface.slug),
    suggested_tool_prefix: toolPrefixFromSlug(surface.slug),
    transports: surface.transports,
    variables: surface.variables.map((variable) => ({
      name: variable.name,
      resolve_from: variable.resolveFrom ?? null,
    })),
  };
}

function projectSource(source: ImportableSource) {
  return {
    blocked_reason: source.blocked_reason,
    source_kind: source.source_kind,
    source_url: source.source_url,
    surface: projectSurface(source.surface),
    transport: source.transport,
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
        // Uses integrations.sh /surface (cached catalog), not live /discover.
        const { parsed } = await registryDiscover(body.domain);
        return hono.json({
          domain: parsed.domain,
          oauth_found: Boolean(
            discoverOAuthFacts(parsed)?.authorizationEndpoint
          ),
          sources: discoverImportableSources(parsed).map(projectSource),
          summary: parsed.summary ?? parsed.description ?? null,
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
        const { discover, surface } = body.domain
          ? await resolveRegistrySource({
              domain: body.domain,
              sourceUrl: body.source_url,
            })
          : { discover: null, surface: null };

        // Blockers are computed before the fetch: an import that cannot
        // succeed should say why rather than spend 30s on a spec first.
        const blockers: string[] = [];
        if (surface) {
          try {
            resolveRequiredHeaders(surface);
          } catch (error) {
            blockers.push(
              error instanceof Error ? error.message : String(error)
            );
          }
          if (surface.variables.length > 0) {
            blockers.push(
              `this surface is templated on ${surface.variables
                .map((variable) => variable.name)
                .join(", ")} — resolve the URL manually before importing`
            );
          }
          if (body.source_kind === "mcp" && !resolveMcpTransport(surface)) {
            blockers.push(
              `unsupported MCP transport (${surface.transports.join(", ")})`
            );
          }
        }

        const prepared = await prepareSource({
          requiredHeaders:
            blockers.length === 0 && surface
              ? resolveRequiredHeaders(surface)
              : [],
          sourceKind: body.source_kind,
          sourceUrl: body.source_url,
          specOverrides: surface?.spec_overrides ?? [],
          transport: surface ? resolveMcpTransport(surface) : null,
        });
        return hono.json({
          actions: prepared.normalized.actions.map((action) => ({
            classification: action.classification,
            description: action.description.slice(0, 200),
            id: action.id,
            summary: action.summary,
            tags: action.tags,
          })),
          applied_overrides: prepared.normalized.applied_overrides,
          base_url: prepared.normalized.base_url,
          discover_found: Boolean(discover),
          dropped_count: prepared.normalized.dropped_count,
          import_blockers: blockers,
          security_schemes: prepared.normalized.security_schemes,
          skipped: prepared.normalized.skipped,
          surface: surface ? projectSurface(surface) : null,
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
        // Registry facts are re-derived server-side from domain + source URL;
        // the request body carries no surface metadata to trust.
        const { discover: discovered, surface } = await resolveRegistrySource({
          domain: body.domain,
          sourceUrl: body.source_url,
        });
        if (surface) {
          const existing = await repo.findByRegistrySurface(
            body.domain,
            surface.slug
          );
          if (existing) {
            return hono.json(
              {
                error: `registry surface "${surface.slug}" on ${body.domain} is already imported as "${existing.id}" — refresh that connector instead`,
              },
              409
            );
          }
        }
        const prepared = await prepareSource({
          requiredHeaders: surface ? resolveRequiredHeaders(surface) : [],
          sourceKind: body.source_kind,
          sourceUrl: body.source_url,
          specOverrides: surface?.spec_overrides ?? [],
          transport: surface ? resolveMcpTransport(surface) : null,
        });
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
          surface,
          toolPrefix: body.tool_prefix,
        });
        await repo.insert(record);
        const skippedActions = registerRecord(record);
        await ctx.recordAuditEvent?.({
          detail: {
            action_count: record.actions.length,
            connector_id: record.id,
            domain: record.domain,
            registry_surface_slug: record.registry_surface_slug,
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
        // A refresh is the deliberate moment registry metadata is re-read:
        // spec overrides, required headers and transport are re-derived from
        // the surface the record was imported from.
        const { surface } = record.registry_surface_slug
          ? await resolveRegistrySource({
              domain: record.domain,
              sourceUrl: record.source_url,
            })
          : { surface: null };
        const requiredHeaders = surface
          ? resolveRequiredHeaders(surface)
          : record.required_headers;
        const transport =
          record.source_kind === "mcp"
            ? ((surface ? resolveMcpTransport(surface) : null) ??
              record.mcp_transport ??
              "streamable-http")
            : null;
        const prepared = await prepareSource({
          requiredHeaders,
          sourceKind: record.source_kind,
          sourceUrl: record.source_url,
          specOverrides: surface?.spec_overrides ?? [],
          transport,
        });
        const before = new Set(record.actions.map((a) => a.id));
        const after = new Set(prepared.normalized.actions.map((a) => a.id));
        const added = [...after].filter((a) => !before.has(a));
        const removed = [...before].filter((a) => !after.has(a));
        const updated: ImportedConnectorRecord = {
          ...record,
          actions: prepared.normalized.actions,
          base_url: record.base_url ?? prepared.normalized.base_url,
          mcp_transport: transport,
          refreshed_at: new Date().toISOString(),
          required_headers: requiredHeaders,
          spec_hash: prepared.spec_hash,
        };
        await repo.update(id, {
          actions: updated.actions,
          base_url: updated.base_url,
          mcp_transport: updated.mcp_transport,
          refreshed_at: updated.refreshed_at,
          required_headers: updated.required_headers,
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
        const status = error instanceof ImportValidationError ? 422 : 502;
        return hono.json(
          { error: error instanceof Error ? error.message : String(error) },
          status
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
