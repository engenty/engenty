/**
 * HTTP routes for the DB-backed file manager. Owner (the file space) is carried
 * in the path: `/api/files/spaces/:ownerType/:ownerId/...`. Every handler
 * dispatches through a {@link FileSource}, so connector sources slot in behind
 * the same surface in Phase B.
 */

import {
  type FileSource,
  type FileSourceContext,
  FileSourceNotFoundError,
} from "@engenty/file-storage";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import type { z } from "@hono/zod-openapi";
import {
  beginUploadBodySchema,
  createFolderBodySchema,
  downloadUrlSchema,
  fileNodeSchema,
  fileSpaceItemParamsSchema,
  fileSpaceParamsSchema,
  fileSpaceUploadParamsSchema,
  folderNodeSchema,
  listingSchema,
  okSchema,
  updateFileBodySchema,
  updateFolderBodySchema,
  uploadTicketSchema,
} from "../schema/file-manager-zod.js";

/** Blobs land in the default file-storage bucket. */
const UPLOAD_BUCKET = "files";

const READ_OP = {
  requiredCapabilities: ["module.files.read"],
  riskLevel: "low" as const,
  idempotent: true,
};
const WRITE_OP = {
  requiredCapabilities: ["module.files.write"],
  riskLevel: "medium" as const,
};

function spaceContext(
  auth: PluginAuthContext | undefined,
  params: { ownerType: string; ownerId: string }
): FileSourceContext {
  if (!auth?.tenantId) {
    throw new Error("file-manager routes require authentication");
  }
  return {
    tenantId: auth.tenantId,
    owner: { type: params.ownerType, id: params.ownerId },
    principalId: auth.principalId,
  };
}

function notFound(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

async function withNotFound<T>(fn: () => Promise<T>): Promise<T | Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FileSourceNotFoundError) {
      return notFound(err.message);
    }
    throw err;
  }
}

export function registerFileManagerRoutes(
  api: PluginServerApi,
  source: FileSource
): void {
  const base = "/api/files/spaces/:ownerType/:ownerId";

  // ── List a folder (folders + files at folderId; null = root) ──
  api.registerHttpRoute({
    method: "get",
    path: `${base}/list`,
    operation: READ_OP,
    summary: "List a file-space folder",
    tags: ["files"],
    request: { params: fileSpaceParamsSchema },
    responses: {
      200: { description: "Folder listing", schema: listingSchema },
    },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceParamsSchema>;
      const url = new URL(ctx.request.url);
      const folderId = url.searchParams.get("folderId");
      const search = url.searchParams.get("search") ?? undefined;
      return source.listFolder(spaceContext(ctx.auth, params), folderId, {
        search,
      });
    },
  });

  // ── Create folder ──
  api.registerHttpRoute({
    method: "post",
    path: `${base}/folders`,
    operation: WRITE_OP,
    summary: "Create a folder",
    tags: ["files"],
    request: { params: fileSpaceParamsSchema, body: createFolderBodySchema },
    responses: {
      201: { description: "Created folder", schema: folderNodeSchema },
    },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceParamsSchema>;
      const body = ctx.body as z.infer<typeof createFolderBodySchema>;
      return withNotFound(async () => {
        const folder = await source.createFolder(
          spaceContext(ctx.auth, params),
          body.parentId ?? null,
          body.name
        );
        return new Response(JSON.stringify(folder), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      });
    },
  });

  // ── Rename / move folder ──
  api.registerHttpRoute({
    method: "patch",
    path: `${base}/folders/:id`,
    operation: WRITE_OP,
    summary: "Rename or move a folder",
    tags: ["files"],
    request: {
      params: fileSpaceItemParamsSchema,
      body: updateFolderBodySchema,
    },
    responses: {
      200: { description: "Updated folder", schema: folderNodeSchema },
    },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceItemParamsSchema>;
      const body = ctx.body as z.infer<typeof updateFolderBodySchema>;
      const sctx = spaceContext(ctx.auth, params);
      // Schema guarantees at least one of name/parentId is present.
      return withNotFound(async () => {
        let folder = null as Awaited<
          ReturnType<FileSource["renameFolder"]>
        > | null;
        if (body.name !== undefined) {
          folder = await source.renameFolder(sctx, params.id, body.name);
        }
        if (body.parentId !== undefined) {
          folder = await source.moveFolder(sctx, params.id, body.parentId);
        }
        return folder;
      });
    },
  });

  // ── Delete folder (cascades to children + blobs) ──
  api.registerHttpRoute({
    method: "delete",
    path: `${base}/folders/:id`,
    operation: { ...WRITE_OP, riskLevel: "high" as const },
    summary: "Delete a folder",
    tags: ["files"],
    request: { params: fileSpaceItemParamsSchema },
    responses: { 200: { description: "Deleted", schema: okSchema } },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceItemParamsSchema>;
      return withNotFound(async () => {
        await source.deleteFolder(spaceContext(ctx.auth, params), params.id);
        return { ok: true };
      });
    },
  });

  // ── Begin upload — register a pending entry, return where to PUT bytes ──
  api.registerHttpRoute({
    method: "post",
    path: `${base}/uploads`,
    operation: WRITE_OP,
    summary: "Register a file upload",
    tags: ["files"],
    request: { params: fileSpaceParamsSchema, body: beginUploadBodySchema },
    responses: {
      200: { description: "Upload ticket", schema: uploadTicketSchema },
    },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceParamsSchema>;
      const body = ctx.body as z.infer<typeof beginUploadBodySchema>;
      return withNotFound(async () => {
        const ticket = await source.beginUpload(
          spaceContext(ctx.auth, params),
          {
            folderId: body.folderId ?? null,
            filename: body.filename,
            mimeType: body.mimeType,
            sizeBytes: body.sizeBytes,
          }
        );
        return { ...ticket, bucket: UPLOAD_BUCKET };
      });
    },
  });

  // ── Finalize upload — flip entry to active after the PUT succeeds ──
  api.registerHttpRoute({
    method: "post",
    path: `${base}/uploads/:entryId/finalize`,
    operation: WRITE_OP,
    summary: "Finalize a file upload",
    tags: ["files"],
    request: { params: fileSpaceUploadParamsSchema },
    responses: { 200: { description: "Created file", schema: fileNodeSchema } },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceUploadParamsSchema>;
      return withNotFound(() =>
        source.finalizeUpload(spaceContext(ctx.auth, params), params.entryId)
      );
    },
  });

  // ── Rename / move file ──
  api.registerHttpRoute({
    method: "patch",
    path: `${base}/files/:id`,
    operation: WRITE_OP,
    summary: "Rename or move a file",
    tags: ["files"],
    request: { params: fileSpaceItemParamsSchema, body: updateFileBodySchema },
    responses: { 200: { description: "Updated file", schema: fileNodeSchema } },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceItemParamsSchema>;
      const body = ctx.body as z.infer<typeof updateFileBodySchema>;
      const sctx = spaceContext(ctx.auth, params);
      return withNotFound(async () => {
        let file = null as Awaited<ReturnType<FileSource["renameFile"]>> | null;
        if (body.name !== undefined) {
          file = await source.renameFile(sctx, params.id, body.name);
        }
        if (body.folderId !== undefined) {
          file = await source.moveFile(sctx, params.id, body.folderId);
        }
        return file;
      });
    },
  });

  // ── Delete file (removes blob + row) ──
  api.registerHttpRoute({
    method: "delete",
    path: `${base}/files/:id`,
    operation: { ...WRITE_OP, riskLevel: "high" as const },
    summary: "Delete a file",
    tags: ["files"],
    request: { params: fileSpaceItemParamsSchema },
    responses: { 200: { description: "Deleted", schema: okSchema } },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceItemParamsSchema>;
      return withNotFound(async () => {
        await source.deleteFile(spaceContext(ctx.auth, params), params.id);
        return { ok: true };
      });
    },
  });

  // ── Signed download URL ──
  api.registerHttpRoute({
    method: "get",
    path: `${base}/files/:id/url`,
    operation: READ_OP,
    summary: "Get a signed download URL",
    tags: ["files"],
    request: { params: fileSpaceItemParamsSchema },
    responses: {
      200: { description: "Signed URL", schema: downloadUrlSchema },
    },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceItemParamsSchema>;
      return withNotFound(async () => {
        const url = await source.getDownloadUrl(
          spaceContext(ctx.auth, params),
          params.id
        );
        return { url };
      });
    },
  });
}
