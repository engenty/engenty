/**
 * The Work sidebar's shortcuts into a file space: the files touched most
 * recently, and the ones this person pinned. Both answer under the same
 * `/api/files/spaces/:ownerType/:ownerId` prefix as the file manager, so a
 * space's Files section and its Data tree talk about the same rows.
 *
 * Pins are personal (per principal) and navigation only — see the
 * `file_pins` migration.
 */

import type { FileEntryRow, FileSourceContext } from "@engenty/file-storage";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { FileShortcutsStore } from "../dal/file-shortcuts-store.js";
import {
  fileNodeSchema,
  fileSpaceItemParamsSchema,
  fileSpaceParamsSchema,
  okSchema,
} from "../schema/file-manager-zod.js";

const READ_OP = {
  requiredCapabilities: ["module.files.read"],
  riskLevel: "low" as const,
  idempotent: true,
};
const WRITE_OP = {
  requiredCapabilities: ["module.files.read"],
  riskLevel: "low" as const,
};

/** The sidebar shows five; the store caps whatever else is asked for. */
const DEFAULT_RECENT_LIMIT = 5;

const fileListSchema = z.object({ files: z.array(fileNodeSchema) });

function spaceContext(
  auth: PluginAuthContext | undefined,
  params: { ownerType: string; ownerId: string }
): FileSourceContext {
  if (!auth?.tenantId) {
    throw new Error("file shortcut routes require authentication");
  }
  return {
    owner: { type: params.ownerType, id: params.ownerId },
    principalId: auth.principalId,
    tenantId: auth.tenantId,
  };
}

function toFileNode(row: FileEntryRow) {
  return {
    createdAt: row.createdAt,
    folderId: row.folderId,
    id: row.id,
    mimeType: row.mimeType,
    name: row.filename,
    sizeBytes: row.sizeBytes,
    source: "native",
    storageKey: row.storageKey,
    updatedAt: row.updatedAt,
  };
}

function readLimit(url: URL): number {
  const raw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RECENT_LIMIT;
}

export function registerFileShortcutsRoutes(
  api: PluginServerApi,
  store: FileShortcutsStore
): void {
  const base = "/api/files/spaces/:ownerType/:ownerId";

  api.registerHttpRoute({
    method: "get",
    path: `${base}/recent`,
    operation: READ_OP,
    summary: "Most recently updated files of a file space",
    tags: ["files"],
    request: { params: fileSpaceParamsSchema },
    responses: { 200: { description: "Recent files", schema: fileListSchema } },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceParamsSchema>;
      const rows = await store.listRecent(
        spaceContext(ctx.auth, params),
        readLimit(new URL(ctx.request.url))
      );
      return { files: rows.map(toFileNode) };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: `${base}/pins`,
    operation: READ_OP,
    summary: "Files the caller pinned in a file space",
    tags: ["files"],
    request: { params: fileSpaceParamsSchema },
    responses: { 200: { description: "Pinned files", schema: fileListSchema } },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceParamsSchema>;
      const rows = await store.listPinned(spaceContext(ctx.auth, params));
      return { files: rows.map(toFileNode) };
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: `${base}/pins/:id`,
    operation: WRITE_OP,
    summary: "Pin a file for the caller",
    tags: ["files"],
    request: { params: fileSpaceItemParamsSchema },
    responses: { 200: { description: "Pinned", schema: okSchema } },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceItemParamsSchema>;
      await store.pin(spaceContext(ctx.auth, params), params.id);
      return { ok: true };
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: `${base}/pins/:id`,
    operation: WRITE_OP,
    summary: "Unpin a file for the caller",
    tags: ["files"],
    request: { params: fileSpaceItemParamsSchema },
    responses: { 200: { description: "Unpinned", schema: okSchema } },
    handler: async (ctx) => {
      const params = ctx.params as z.infer<typeof fileSpaceItemParamsSchema>;
      await store.unpin(spaceContext(ctx.auth, params), params.id);
      return { ok: true };
    },
  });
}
