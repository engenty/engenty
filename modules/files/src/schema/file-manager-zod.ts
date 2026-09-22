import { z } from "@hono/zod-openapi";
import { decodeConnectorNodeId } from "../sources/connector-ref.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A file-space node: a `file_folders`/`file_entries` uuid, or a virtual
 * connector id (`cnx:<uuid>:<base64url-ref>`). Nested folders inside a mount
 * are the second kind — only the mount root is a database row.
 */
export function isFileSpaceNodeId(id: string): boolean {
  return UUID_PATTERN.test(id) || decodeConnectorNodeId(id) !== null;
}

export const fileSpaceNodeIdSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(isFileSpaceNodeId, {
    message: "Must be a file-space uuid or a connector node id",
  });

/** Path params identifying the file space (owner). */
export const fileSpaceParamsSchema = z.object({
  ownerType: z.string().min(1).max(64),
  ownerId: z.string().min(1).max(128),
});

export const fileSpaceItemParamsSchema = fileSpaceParamsSchema.extend({
  // A DB row uuid or a virtual connector node id ("cnx:<uuid>:<base64url-ref>",
  // long for deep provider paths).
  id: fileSpaceNodeIdSchema,
});

export const fileSpaceUploadParamsSchema = fileSpaceParamsSchema.extend({
  entryId: z.string().uuid(),
});

export const listFolderQuerySchema = z.object({
  folderId: fileSpaceNodeIdSchema.nullish(),
  search: z.string().max(200).optional(),
});

export const createFolderBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: z.string().uuid().nullish(),
});

export const updateFolderBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    parentId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.parentId !== undefined, {
    message: "Provide name and/or parentId",
  });

/** Read a non-mounted connection file (e.g. CSV import picker). */
export const readFileSourceBodySchema = z.object({
  fileRef: z.string().trim().min(1).max(2048),
});

export const beginUploadBodySchema = z.object({
  filename: z.string().trim().min(1).max(400),
  folderId: z.string().uuid().nullish(),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
});

export const updateFileBodySchema = z
  .object({
    name: z.string().trim().min(1).max(400).optional(),
    folderId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.folderId !== undefined, {
    message: "Provide name and/or folderId",
  });

/**
 * How large a saved file may be, encoded.
 *
 * Smaller than the upload ceiling on purpose: these bytes travel through core
 * inside a JSON body rather than straight to storage on a signed URL, and this
 * route exists for documents somebody edited in a browser. Anything larger is
 * still an upload.
 */
export const FILE_CONTENT_MAX_BYTES = 5 * 1024 * 1024;

export const replaceFileContentBodySchema = z.object({
  content: z.string().max(FILE_CONTENT_MAX_BYTES),
  /**
   * `base64` is here so the route is not a text-only door — the encoding is
   * stated by the caller rather than guessed from the content type, because a
   * guess that is wrong corrupts the file it was trying to save.
   */
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
  /** The `updatedAt` the editor read; a newer row answers 409. */
  expectedUpdatedAt: z.string().min(1),
});

export const folderNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  source: z.string(),
  connectionId: z.string().optional(),
  readOnly: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const fileNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  folderId: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  source: z.string(),
  storageKey: z.string().optional(),
  readOnly: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listingSchema = z.object({
  folders: z.array(folderNodeSchema),
  files: z.array(fileNodeSchema),
  cursor: z.string().optional(),
  readOnly: z.boolean().optional(),
});

/** `files_account_bind` — core sends the account and the space it landed in. */
export const fileAccountBindInputSchema = z.object({
  connection_id: z.string().uuid(),
  space_id: z.string().uuid(),
});

export const fileAccountBindResultSchema = z.object({
  /** False when the account is not a drive — not a failure, just not ours. */
  bound: z.boolean(),
  /** False when the mount was already there; binding runs more than once. */
  created: z.boolean(),
  folder_id: z.string().nullable(),
});

/** `files_space_mount` — the module's mountOperation; core sends the space. */
export const fileSpaceMountInputSchema = z.object({
  space_id: z.string().uuid(),
});

export const fileSpaceMountResultSchema = z.object({
  /** One entry per drive the space has placed, mounted as `files_account_bind` mounts it. */
  bound: z.array(
    fileAccountBindResultSchema.extend({ connection_id: z.string() })
  ),
  /** Always empty: a space's Files works with native folders alone. */
  needs: z.array(z.string()),
  ready: z.boolean(),
});

export const createMountBodySchema = z.object({
  connectionId: z.string().uuid(),
  /** Provider folder ref to mount; null mounts the connection's root. */
  folderRef: z.string().max(2048).nullable(),
  name: z.string().trim().min(1).max(200),
  parentId: z.string().uuid().nullish(),
});

export const fileSourceSummarySchema = z.object({
  connectionId: z.string(),
  connectorIcon: z.string().nullable(),
  connectorId: z.string(),
  connectorName: z.string(),
  label: z.string(),
  sharing: z.string(),
  allSpaces: z.boolean().optional(),
});

export const browseEntrySchema = z.object({
  kind: z.enum(["file", "folder"]),
  mimeType: z.string().nullable(),
  modifiedAt: z.string().nullable(),
  name: z.string(),
  ref: z.string(),
  size: z.number().nullable(),
});

export const uploadTicketSchema = z.object({
  entryId: z.string(),
  storageKey: z.string(),
  bucket: z.string(),
});

export const downloadUrlSchema = z.object({ url: z.string() });

export const okSchema = z.object({ ok: z.boolean() });
