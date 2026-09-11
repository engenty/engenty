/**
 * HTTP routes for the DB-backed file manager. Owner (the file space) is carried
 * in the path: `/api/files/spaces/:ownerType/:ownerId/...`. Every handler
 * dispatches through a {@link FileSource}, so connector sources slot in behind
 * the same surface in Phase B.
 */

import {
  type FileSource,
  FileSourceConflictError,
  type FileSourceContext,
  FileSourceNotFoundError,
  FileSourceReadOnlyError,
} from "@engenty/file-storage";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import type { z } from "@hono/zod-openapi";
import {
  beginUploadBodySchema,
  createFolderBodySchema,
  downloadUrlSchema,
  FILE_CONTENT_MAX_BYTES,
  fileNodeSchema,
  fileSpaceItemParamsSchema,
  fileSpaceParamsSchema,
  fileSpaceUploadParamsSchema,
  folderNodeSchema,
  listingSchema,
  okSchema,
  replaceFileContentBodySchema,
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
    if (err instanceof FileSourceReadOnlyError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
    if (err instanceof FileSourceConflictError) {
      // The current token travels with the refusal, so the client can offer to
      // reload rather than only report failure.
      //
      // Written in the CANONICAL envelope rather than the loose
      // `{error: "…"}` shape its 403/404 siblings use, because core rewrites a
      // plugin route's error body through `parseLegacyErrorBody`: that path
      // keeps only a handful of known keys, nests whatever it does keep one
      // level deeper, and derives `code` from the status. An already-valid
      // `ApiErrorResponse` is returned untouched — so this is the one shape
      // where `file_conflict` and the token both survive the trip.
      return new Response(
        JSON.stringify({
          error: {
            code: "file_conflict",
            details: { currentUpdatedAt: err.currentUpdatedAt },
            message: err.message,
          },
          ok: false,
        }),
        { status: 409, headers: { "content-type": "application/json" } }
      );
    }
    throw err;
  }
}

/**
 * Body text → bytes, refusing anything that is not what it claims to be.
 *
 * `atob` accepts a good deal of near-base64 and quietly produces garbage, so
 * the decode is verified by re-encoding: a payload that does not survive the
 * round trip is rejected rather than written over somebody's file.
 */
export function decodeContent(
  content: string,
  encoding: "base64" | "utf-8"
): Uint8Array | null {
  if (encoding === "utf-8") {
    return new TextEncoder().encode(content);
  }
  try {
    const bytes = Uint8Array.from(Buffer.from(content, "base64"));
    return Buffer.from(bytes).toString("base64") === content.replace(/\s/g, "")
      ? bytes
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the space a file space's owner belongs to. Server-side by
 * construction — see `FileSourceContext.spaceId` for why this must never come
 * from the request.
 */
export type ResolveOwnerSpaceId = (
  auth: PluginAuthContext,
  owner: { ownerId: string; ownerType: string }
) => Promise<string | null>;

export function registerFileManagerRoutes(
  api: PluginServerApi,
  source: FileSource,
  resolveOwnerSpaceId: ResolveOwnerSpaceId
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
        // The ONLY handler that mints a storage key, so the only one that has
        // to know the space. The other nine read `entry.storageKey` as stored.
        const base = spaceContext(ctx.auth, params);
        const spaceId =
          base.owner.type === "space"
            ? base.owner.id
            : await resolveOwnerSpaceId(ctx.auth as PluginAuthContext, params);
        const ticket = await source.beginUpload(
          { ...base, ...(spaceId ? { spaceId } : {}) },
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

  // ── Replace file content (save an edit) ──
  api.registerHttpRoute({
    method: "put",
    path: `${base}/files/:id/content`,
    operation: WRITE_OP,
    summary: "Replace a file's content",
    tags: ["files"],
    request: {
      params: fileSpaceItemParamsSchema,
      body: replaceFileContentBodySchema,
    },
    responses: {
      200: { description: "Updated file", schema: fileNodeSchema },
      409: { description: "The file changed since it was opened" },
    },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceItemParamsSchema>;
      const body = ctx.body as z.infer<typeof replaceFileContentBodySchema>;
      const data = decodeContent(body.content, body.encoding);
      if (!data) {
        return new Response(
          JSON.stringify({ error: "content is not valid base64" }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      // The schema caps the ENCODED string; base64 shrinks by a quarter on the
      // way in, so the real byte count is only known here.
      if (data.byteLength > FILE_CONTENT_MAX_BYTES) {
        return new Response(JSON.stringify({ error: "content too large" }), {
          status: 413,
          headers: { "content-type": "application/json" },
        });
      }
      return withNotFound(() =>
        source.replaceContent(spaceContext(ctx.auth, params), params.id, {
          data,
          expectedUpdatedAt: body.expectedUpdatedAt,
        })
      );
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
