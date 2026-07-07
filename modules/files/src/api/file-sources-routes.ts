/**
 * Connected file sources for file spaces: list file-capable connections, browse
 * one for the mount picker, create mounts, and proxy downloads for providers
 * that return bytes instead of URLs. Policy is enforced by the connections
 * module client (every browse/read is a gated `files_*` action).
 */

import type {
  ConnectionPolicyPrincipal,
  ConnectionsModuleClient,
} from "@engenty/connections-sdk";
import type { FileSourceContext } from "@engenty/file-storage";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import type { z } from "@hono/zod-openapi";
import type { FileMountStore } from "../dal/file-manager-store.js";
import {
  createMountBodySchema,
  fileSpaceItemParamsSchema,
  fileSpaceParamsSchema,
  folderNodeSchema,
} from "../schema/file-manager-zod.js";
import { decodeConnectorNodeId } from "../sources/connector-ref.js";

const READ_OP = {
  requiredCapabilities: ["module.files.read"],
  riskLevel: "low" as const,
  idempotent: true,
};
const WRITE_OP = {
  requiredCapabilities: ["module.files.write"],
  riskLevel: "medium" as const,
};

/** Connector id → file_folders.source kind (must satisfy the check constraint). */
const CONNECTOR_SOURCE_KINDS: Record<string, string> = {
  dropbox: "dropbox",
  "google-drive": "gdrive",
  "local-files": "local",
  "microsoft-onedrive": "onedrive",
  s3: "s3",
};

function principalOf(auth: PluginAuthContext): ConnectionPolicyPrincipal {
  return { principalId: auth.principalId, principalType: "user" };
}

interface Hono {
  json: (data: unknown, status?: number) => unknown;
}

export function registerFileSourcesRoutes(
  server: PluginServerApi,
  deps: {
    client: ConnectionsModuleClient;
    mounts: FileMountStore;
  }
): void {
  const { client, mounts } = deps;

  // ── List file-capable connections visible to the caller ──
  server.registerHttpRoute({
    method: "get",
    path: "/api/files/sources",
    operation: READ_OP,
    summary: "List connections that can be mounted as file sources",
    tags: ["files"],
    handler: async (ctx) => {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const all = await client.listFileSources({
        tenantId: ctx.auth.tenantId,
      });
      const visible = all.filter(
        (c) => c.sharing === "org" || c.owner_user_id === ctx.auth?.principalId
      );
      return {
        sources: visible.map((c) => ({
          connectionId: c.id,
          connectorIcon: c.connector_icon,
          connectorId: c.connector_id,
          connectorName: c.connector_name,
          label: c.display_name ?? c.external_account ?? c.connector_name,
          sharing: c.sharing,
        })),
      };
    },
  });

  // ── Browse a source (mount picker) ──
  server.registerHttpRoute({
    method: "get",
    path: "/api/files/sources/:connectionId/browse",
    operation: READ_OP,
    summary: "Browse a file-capable connection for the folder picker",
    tags: ["files"],
    handler: async (ctx) => {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const connectionId = (ctx.params as { connectionId?: string })
        ?.connectionId;
      if (!connectionId) {
        return hono.json({ error: "missing connectionId" }, 400);
      }
      const url = new URL(ctx.request.url);
      const folderRef = url.searchParams.get("folderRef");
      const cursor = url.searchParams.get("cursor");
      const result = await client.filesList({
        connectionId,
        cursor,
        folderRef: folderRef || null,
        principal: principalOf(ctx.auth),
        tenantId: ctx.auth.tenantId,
      });
      return {
        cursor: result.next_cursor,
        entries: result.entries.map((entry) => ({
          kind: entry.kind,
          mimeType: entry.mime_type,
          modifiedAt: entry.modified_at,
          name: entry.name,
          ref: entry.ref,
          size: entry.size,
        })),
      };
    },
  });

  // ── Mount a connected folder into a file space ──
  server.registerHttpRoute({
    method: "post",
    path: "/api/files/spaces/:ownerType/:ownerId/mounts",
    operation: WRITE_OP,
    summary: "Mount a connected folder into a file space",
    tags: ["files"],
    request: { params: fileSpaceParamsSchema, body: createMountBodySchema },
    responses: {
      201: { description: "Created mount folder", schema: folderNodeSchema },
    },
    handler: async (ctx) => {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const params = ctx.params as z.infer<typeof fileSpaceParamsSchema>;
      const body = ctx.body as z.infer<typeof createMountBodySchema>;
      const sctx: FileSourceContext = {
        owner: { id: params.ownerId, type: params.ownerType },
        principalId: ctx.auth.principalId,
        tenantId: ctx.auth.tenantId,
      };

      const sources = await client.listFileSources({
        tenantId: ctx.auth.tenantId,
      });
      const connection = sources.find((c) => c.id === body.connectionId);
      if (
        !connection ||
        (connection.sharing !== "org" &&
          connection.owner_user_id !== ctx.auth.principalId)
      ) {
        return hono.json({ error: "connection not available" }, 404);
      }
      const sourceKind = CONNECTOR_SOURCE_KINDS[connection.connector_id];
      if (!sourceKind) {
        return hono.json(
          { error: `connector ${connection.connector_id} cannot be mounted` },
          400
        );
      }
      // Validate the picked ref is a folder (skip for provider roots).
      if (body.folderRef !== null) {
        const entry = await client.filesStat({
          connectionId: body.connectionId,
          principal: principalOf(ctx.auth),
          ref: body.folderRef,
          tenantId: ctx.auth.tenantId,
        });
        if (entry.kind !== "folder") {
          return hono.json({ error: "folderRef is not a folder" }, 400);
        }
      }
      const mount = await mounts.create(sctx, {
        connectionId: body.connectionId,
        name: body.name,
        parentId: body.parentId ?? null,
        source: sourceKind,
        sourceFolderId: body.folderRef,
      });
      ctx.recordAuditEvent?.({
        detail: {
          connection_id: body.connectionId,
          folder_id: mount.id,
          owner: `${params.ownerType}/${params.ownerId}`,
        },
        type: "files.source_mounted",
      });
      return new Response(JSON.stringify({ ...mount, source: sourceKind }), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    },
  });

  // ── Proxy download for providers that return bytes (Drive/OneDrive/local) ──
  server.registerHttpRoute({
    method: "get",
    path: "/api/files/spaces/:ownerType/:ownerId/files/:id/download",
    operation: READ_OP,
    responseMode: "binary",
    summary: "Download a connector-mounted file's bytes",
    tags: ["files"],
    request: { params: fileSpaceItemParamsSchema },
    handler: async (ctx) => {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const params = ctx.params as z.infer<typeof fileSpaceItemParamsSchema>;
      const decoded = decodeConnectorNodeId(params.id);
      if (!decoded) {
        return hono.json({ error: "not a connector file" }, 404);
      }
      const result = await client.filesRead({
        connectionId: decoded.connectionId,
        fileRef: decoded.ref,
        principal: principalOf(ctx.auth),
        tenantId: ctx.auth.tenantId,
      });
      if (result.kind === "url") {
        return Response.redirect(result.url, 302);
      }
      const bytes =
        result.kind === "base64"
          ? Uint8Array.from(atob(result.content_base64), (c) => c.charCodeAt(0))
          : new TextEncoder().encode(result.content);
      const filename = result.name ?? decoded.ref.split("/").pop() ?? "file";
      return new Response(bytes, {
        headers: {
          "content-disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
          "content-type": result.mime_type ?? "application/octet-stream",
        },
      });
    },
  });
}
