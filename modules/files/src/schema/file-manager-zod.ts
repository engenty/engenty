import { z } from "@hono/zod-openapi";

/** Path params identifying the file space (owner). */
export const fileSpaceParamsSchema = z.object({
  ownerType: z.string().min(1).max(64),
  ownerId: z.string().min(1).max(128),
});

export const fileSpaceItemParamsSchema = fileSpaceParamsSchema.extend({
  id: z.string().uuid(),
});

export const fileSpaceUploadParamsSchema = fileSpaceParamsSchema.extend({
  entryId: z.string().uuid(),
});

export const listFolderQuerySchema = z.object({
  folderId: z.string().uuid().nullish(),
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

export const folderNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  source: z.string(),
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
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listingSchema = z.object({
  folders: z.array(folderNodeSchema),
  files: z.array(fileNodeSchema),
  cursor: z.string().optional(),
});

export const uploadTicketSchema = z.object({
  entryId: z.string(),
  storageKey: z.string(),
  bucket: z.string(),
});

export const downloadUrlSchema = z.object({ url: z.string() });

export const okSchema = z.object({ ok: z.boolean() });
