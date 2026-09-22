import type { ConnectionsRepo } from "@engenty/connections-sdk";
import { capabilityCovers, type PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "zod";
import { ImportValidationError } from "../errors.js";
import {
  assembleRecord,
  connectorIdFromSlug,
  prepareSource,
  resolveRequiredHeaders,
  surfaceRequiresAuth,
  toolPrefixFromSlug,
} from "../import-service.js";
import { preferImportedTokenAuth } from "../prefer-token-auth.js";
import {
  applyImportedRefresh,
  withImportedAccessToken,
} from "../refresh-actions.js";
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
 * Tenant import console API. Imports are tenant-scoped (marketplace Phase 1):
 * `tenant_id` is stamped from auth, never from the client. Tenant admins
 * (`core.users.manage`) or superadmins may import. Search and paste live in
 * the marketplace; `/setup/connectors` lists this tenant's installs.
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
  const {
    client_id_enc,
    client_secret_enc: _clientSecretEnc,
    registry_snapshot,
    ...rest
  } = record;
  return {
    ...rest,
    action_count: record.actions.length,
    has_oauth_client: Boolean(client_id_enc),
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
  connectionsRepo: ConnectionsRepo;
  /** (Re-)register a record's connector live; returns skipped action ids. */
  registerRecord: (record: ImportedConnectorRecord) => string[];
  removeRecord: (id: string, tenantId: string) => void;
  repo: ExternalConnectorsRepo;
}

export function registerExternalConnectorRoutes(
  server: PluginServerApi,
  deps: ExternalRoutesDeps
): void {
  const { connectionsRepo, registerRecord, removeRecord, repo } = deps;

  const guard = (ctx: {
    auth?: { capabilities?: string[]; tenantId?: string } | null;
  }): string | null => {
    if (!ctx.auth?.tenantId) {
      return "Unauthorized";
    }
    const caps = ctx.auth.capabilities ?? [];
    if (
      !(
        capabilityCovers(caps, "core.users.manage") ||
        capabilityCovers(caps, "core.superadmin") ||
        capabilityCovers(caps, "*")
      )
    ) {
      return "Forbidden: importing connectors requires tenant admin";
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
          credentials: Object.values(parsed.credentials).map((credential) => ({
            generate_url: credential.generateUrl ?? null,
            label: credential.label ?? credential.type,
            setup: credential.setup ?? null,
            type: credential.type,
          })),
          description: parsed.description ?? null,
          domain: parsed.domain,
          oauth_found: Boolean(
            discoverOAuthFacts(parsed)?.authorizationEndpoint
          ),
          sources: discoverImportableSources(parsed).map(projectSource),
          summary: parsed.summary ?? null,
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
          deferMcpTools:
            body.source_kind === "mcp" && surfaceRequiresAuth(surface),
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
      const tenantId = ctx.auth?.tenantId as string;
      const body = ctx.body as z.infer<typeof importBody>;
      if (await repo.get(tenantId, body.id)) {
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
            tenantId,
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
          deferMcpTools:
            body.source_kind === "mcp" && surfaceRequiresAuth(surface),
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
          tenantId,
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
      const tenantId = ctx.auth?.tenantId as string;
      const records = await repo.list(tenantId);
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
      const tenantId = ctx.auth?.tenantId as string;
      const id = (ctx.params as Record<string, string>).id;
      const record = await repo.get(tenantId, id);
      if (!record) {
        return hono.json({ error: "not found" }, 404);
      }
      try {
        const result = await withImportedAccessToken({
          connectionsRepo,
          record,
          use: (accessToken) =>
            applyImportedRefresh({
              accessToken,
              record,
              registerRecord,
              repo,
            }),
        });
        await ctx.recordAuditEvent?.({
          detail: {
            added: result.added,
            connector_id: id,
            removed: result.removed,
          },
          type: "external_connector.refreshed",
        });
        return hono.json({
          added: result.added,
          connector: projectRecord(result.updated),
          removed: result.removed,
          // New actions register live; changed schemas and removed actions
          // fully settle on the next core restart (operations are add-only).
          restart_recommended: result.removed.length > 0,
          skipped_actions: result.skippedActions,
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
    path: "/api/external-connectors/:id/prefer-token",
    summary:
      "Switch an unconfigured OAuth import to its API token when the spec offers one",
    async handler(ctx) {
      const hono = ctx.hono as Hono;
      const denied = guard(ctx);
      if (denied) {
        return hono.json(
          { error: denied },
          denied === "Unauthorized" ? 401 : 403
        );
      }
      const tenantId = ctx.auth?.tenantId as string;
      const id = (ctx.params as Record<string, string>).id;
      const record = await repo.get(tenantId, id);
      if (!record) {
        return hono.json({ error: "not found" }, 404);
      }
      try {
        const result = await preferImportedTokenAuth({
          record,
          registerRecord,
          repo,
        });
        return hono.json(result);
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
      const tenantId = ctx.auth?.tenantId as string;
      const id = (ctx.params as Record<string, string>).id;
      const body = ctx.body as z.infer<typeof statusBody>;
      const record = await repo.get(tenantId, id);
      if (!record) {
        return hono.json({ error: "not found" }, 404);
      }
      await repo.setStatus(tenantId, id, body.status);
      if (body.status === "disabled") {
        removeRecord(id, tenantId);
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
      const tenantId = ctx.auth?.tenantId as string;
      const id = (ctx.params as Record<string, string>).id;
      const record = await repo.get(tenantId, id);
      if (!record) {
        return hono.json({ error: "not found" }, 404);
      }
      await repo.delete(tenantId, id);
      removeRecord(id, tenantId);
      await ctx.recordAuditEvent?.({
        detail: { connector_id: id },
        type: "external_connector.deleted",
      });
      return hono.json({ ok: true, restart_recommended: true });
    },
  });
}
