/**
 * Connected file sources for file spaces: list file-capable connections, browse
 * one for the mount picker, create mounts, and proxy downloads for providers
 * that return bytes instead of URLs. Policy is enforced by the connections
 * module client (every browse/read is a gated `files_*` action).
 *
 * A drive belongs to one Space (PLAN-space-owned-connections.md): it is usable
 * by that Space's members and agents, and mounts only into that Space's Files.
 * The SDK does not narrow calls that name a connection directly, so every
 * route here checks the connection against the caller's Spaces first.
 */

import type {
  ConnectionPolicyPrincipal,
  ConnectionsModuleClient,
} from "@engenty/connections-sdk";
import type { FileSourceContext } from "@engenty/file-storage";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import type { z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileMountStore } from "../dal/file-manager-store.js";
import {
  createMountBodySchema,
  fileAccountBindInputSchema,
  fileAccountBindResultSchema,
  fileSpaceItemParamsSchema,
  fileSpaceMountInputSchema,
  fileSpaceMountResultSchema,
  fileSpaceParamsSchema,
  folderNodeSchema,
  readFileSourceBodySchema,
} from "../schema/file-manager-zod.js";
import { decodeConnectorNodeId } from "../sources/connector-ref.js";
import { resolveCallerSpaceIds } from "./caller-spaces.js";
import { connectorDownloadHeaders } from "./connector-download-headers.js";

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
  return {
    principalId: auth.principalId,
    principalType: auth.principalType ?? "user",
  };
}

interface Hono {
  json: (data: unknown, status?: number) => unknown;
}

export function registerFileSourcesRoutes(
  server: PluginServerApi,
  deps: {
    client: ConnectionsModuleClient;
    getDb: (auth: { tenantId: string }) => SupabaseClient;
    mounts: FileMountStore;
  }
): void {
  const { client, getDb, mounts } = deps;

  type FileSource = Awaited<
    ReturnType<ConnectionsModuleClient["listFileSources"]>
  >[number];

  /**
   * The file-capable connections this caller may use: those of the caller's
   * Spaces, narrowed to one Space when `spaceId` names it.
   */
  async function usableSources(
    auth: PluginAuthContext,
    spaceId?: string | null
  ): Promise<FileSource[]> {
    const [sources, spaces] = await Promise.all([
      client.listFileSources({ tenantId: auth.tenantId }),
      resolveCallerSpaceIds(getDb({ tenantId: auth.tenantId }), auth),
    ]);
    return sources.filter(
      (source) =>
        spaces.has(source.space_id) && (!spaceId || source.space_id === spaceId)
    );
  }

  /** One usable connection, or null when the caller's Spaces own no such drive. */
  async function usableSource(
    auth: PluginAuthContext,
    connectionId: string,
    spaceId?: string | null
  ): Promise<FileSource | null> {
    return (
      (await usableSources(auth, spaceId)).find(
        (source) => source.id === connectionId
      ) ?? null
    );
  }

  /**
   * Show one of a space's drives in its Files (PLAN-connections-ux.md B3b).
   * Without it, connecting a Drive leaves an account whose folders appear
   * nowhere.
   *
   * Mounts the PROVIDER ROOT (`source_folder_id: null`), not a picked folder.
   * Choosing a subfolder is a decision only the person can make, and the picker
   * is still there for it — a root mount is the answer that is right without
   * asking, and narrowing it later is an edit rather than a second mount.
   *
   * Idempotent: an owner that already has a mount for this connection keeps it.
   * Binding runs again whenever either side is re-added, and a second root for
   * the same drive is a duplicate tree nobody asked for.
   */
  async function bindDrive(
    auth: PluginAuthContext,
    spaceId: string,
    connection: FileSource | undefined
  ): Promise<z.infer<typeof fileAccountBindResultSchema>> {
    // Not a failure: most accounts are not drives, and the module declares
    // its need by CAPABILITY rather than by connector.
    // Only the owning Space's Files show a drive.
    if (!connection || connection.space_id !== spaceId) {
      return { bound: false, created: false, folder_id: null };
    }
    const source = CONNECTOR_SOURCE_KINDS[connection.connector_id];
    if (!source) {
      return { bound: false, created: false, folder_id: null };
    }
    const sctx: FileSourceContext = {
      owner: { id: spaceId, type: "space" },
      principalId: auth.principalId,
      tenantId: auth.tenantId,
    };
    const existing = await mounts.findByConnection(sctx, connection.id);
    if (existing) {
      return { bound: true, created: false, folder_id: existing.id };
    }
    const mount = await mounts.create(sctx, {
      connectionId: connection.id,
      name:
        connection.display_name?.trim() ||
        connection.external_account?.trim() ||
        connection.connector_name,
      parentId: null,
      source,
      sourceFolderId: null,
    });
    return { bound: true, created: true, folder_id: mount.id };
  }

  /**
   * An account connected in a space where Files already is — the manifest names
   * this operation in `connections[].bindOperation`, and core calls it from
   * `POST /api/spaces/:id/setup/add` for that pair. When Files itself is being
   * mounted, `files_space_mount` mounts every drive the space has instead.
   */
  server.registerOperation({
    operationId: "files_account_bind",
    moduleId: "files",
    spacePolicy: {
      connectionInputKey: "connection_id",
      kind: "account_mounted",
    },
    summary: "Show one of this space's drives in its Files",
    requiredCapabilities: ["module.files.write"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: fileAccountBindInputSchema,
    outputSchema: fileAccountBindResultSchema,
    handler: async (input, ctx) => {
      const auth = ctx.auth;
      if (!auth) {
        throw new Error("files_account_bind requires authentication");
      }
      const parsed = fileAccountBindInputSchema.parse(input ?? {});
      const sources = await client.listFileSources({ tenantId: auth.tenantId });
      return await bindDrive(
        auth,
        parsed.space_id,
        sources.find((source) => source.id === parsed.connection_id)
      );
    },
  });

  /**
   * The module's `mountOperation` (engenty.plugin.json): core calls it with
   * `{ space_id }` from every path that mounts Files into a space — the create
   * wizard, the setup dialog, the `space_setup` tool. Every drive the space
   * already owns gets its root mounted here, the same way
   * `files_account_bind` mounts one.
   *
   * A space's Files needs no row to exist (the root is `parent_id is null`
   * under the space owner) and works with native folders alone, so it is
   * always ready and never `needs` anything.
   */
  server.registerOperation({
    operationId: "files_space_mount",
    moduleId: "files",
    spacePolicy: {
      kind: "space_owned",
    },
    summary: "Set up this space's Files (runs on mount)",
    description:
      "Runs automatically when Files is mounted into a space (space_setup action='add'): shows every drive the space owns in its Files. Idempotent. Not a tool to reach for — mount the module and this runs.",
    requiredCapabilities: ["module.files.write"],
    riskLevel: "low",
    idempotent: true,
    inputSchema: fileSpaceMountInputSchema,
    outputSchema: fileSpaceMountResultSchema,
    handler: async (input, ctx) => {
      const auth = ctx.auth;
      if (!auth) {
        throw new Error("files_space_mount requires authentication");
      }
      const parsed = fileSpaceMountInputSchema.parse(input ?? {});
      const sources = await client.listFileSources({ tenantId: auth.tenantId });
      const bound: z.infer<typeof fileSpaceMountResultSchema>["bound"] = [];
      for (const source of sources) {
        if (source.space_id !== parsed.space_id) {
          continue;
        }
        bound.push({
          ...(await bindDrive(auth, parsed.space_id, source)),
          connection_id: source.id,
        });
      }
      return { bound, needs: [], ready: true };
    },
  });

  // ── List file-capable connections of the caller's Spaces ──
  server.registerHttpRoute({
    method: "get",
    path: "/api/files/sources",
    operation: READ_OP,
    summary:
      "List connections that can be mounted as file sources (optionally one Space's, via ?spaceId=)",
    tags: ["files"],
    handler: async (ctx) => {
      const hono = ctx.hono as Hono;
      if (!ctx.auth) {
        return hono.json({ error: "Unauthorized" }, 401);
      }
      const spaceId = new URL(ctx.request.url).searchParams.get("spaceId");
      const visible = await usableSources(ctx.auth, spaceId);
      return {
        sources: visible.map((c) => ({
          connectionId: c.id,
          connectorIcon: c.connector_icon,
          connectorId: c.connector_id,
          connectorName: c.connector_name,
          label: c.display_name ?? c.external_account ?? c.connector_name,
          spaceId: c.space_id,
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
      if (!(await usableSource(ctx.auth, connectionId))) {
        return hono.json({ error: "connection not available" }, 404);
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

  // ── Read a source file as text (CSV import / one-shot pull) ──
  server.registerHttpRoute({
    method: "post",
    path: "/api/files/sources/:connectionId/read",
    operation: READ_OP,
    summary: "Read a file from a connection as text for import",
    tags: ["files"],
    request: { body: readFileSourceBodySchema },
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
      const body = ctx.body as z.infer<typeof readFileSourceBodySchema>;

      if (!(await usableSource(ctx.auth, connectionId))) {
        return hono.json({ error: "connection not available" }, 404);
      }

      const result = await client.filesRead({
        connectionId,
        fileRef: body.fileRef,
        maxBytes: 8 * 1024 * 1024,
        principal: principalOf(ctx.auth),
        tenantId: ctx.auth.tenantId,
      });

      if (result.kind === "url") {
        const res = await fetch(result.url);
        if (!res.ok) {
          return hono.json(
            { error: `failed to fetch file url (${res.status})` },
            502
          );
        }
        const content = await res.text();
        return {
          content,
          filename: result.name ?? "import.csv",
          mimeType: result.mime_type ?? null,
        };
      }
      if (result.kind === "base64") {
        const bytes = Uint8Array.from(atob(result.content_base64), (c) =>
          c.charCodeAt(0)
        );
        return {
          content: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
          filename: result.name ?? "import.csv",
          mimeType: result.mime_type ?? null,
        };
      }
      return {
        content: result.content,
        filename: result.name ?? "import.csv",
        mimeType: result.mime_type ?? null,
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

      // A drive mounts only into its own Space's Files.
      const connection =
        params.ownerType === "space"
          ? await usableSource(ctx.auth, body.connectionId, params.ownerId)
          : null;
      if (!connection) {
        return hono.json(
          { error: "connection not available in this space" },
          404
        );
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
      // The id is client-supplied: only this Space's own drives are read.
      const connection =
        params.ownerType === "space"
          ? await usableSource(ctx.auth, decoded.connectionId, params.ownerId)
          : null;
      if (!connection) {
        return hono.json({ error: "connection not available" }, 404);
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
        headers: connectorDownloadHeaders({
          filename,
          mimeType: result.mime_type,
        }),
      });
    },
  });
}
