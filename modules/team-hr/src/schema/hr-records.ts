import { z } from "@hono/zod-openapi";

/** Employment-section gallery photo stored in vault + metadata row. */
export interface TeamMemberGalleryPhoto {
  alt_text: string | null;
  copyright: string | null;
  created_at: string;
  id: string;
  profile_id: string;
  scope_id: string;
  sort_order: number;
  storage_key: string;
  tenant_id: string;
  title: string | null;
  updated_at: string;
}

export type TeamMemberGalleryPhotoInput = Pick<
  TeamMemberGalleryPhoto,
  "storage_key" | "title" | "alt_text" | "copyright" | "sort_order"
>;

export type TeamMemberGalleryPhotoUpdateInput = Partial<
  Pick<
    TeamMemberGalleryPhoto,
    "title" | "alt_text" | "copyright" | "sort_order"
  >
>;

/** Contract file metadata; `profile_id` matches the team member's profile id. */
export interface TeamMemberContract {
  file_name: string;
  file_path: string;
  file_size: number;
  id: string;
  profile_id: string;
  scope_id: string;
  tenant_id: string;
  uploaded_at: string;
  uploaded_by: string | null;
}

export const teamMemberGalleryPhotoSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  scope_id: z.string(),
  profile_id: z.string(),
  storage_key: z.string().min(1),
  title: z.string().nullable(),
  alt_text: z.string().nullable(),
  copyright: z.string().nullable(),
  sort_order: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const teamMemberGalleryPhotoCreateSchema = z.object({
  storage_key: z.string().min(1),
  title: z.string().nullable().optional(),
  alt_text: z.string().nullable().optional(),
  copyright: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export const teamMemberGalleryPhotoUpdateSchema = z.object({
  title: z.string().nullable().optional(),
  alt_text: z.string().nullable().optional(),
  copyright: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export const teamMemberContractSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  scope_id: z.string(),
  profile_id: z.string(),
  file_name: z.string(),
  file_path: z.string(),
  file_size: z.number().int().nonnegative(),
  uploaded_at: z.string(),
  uploaded_by: z.string().uuid().nullable(),
});

export const teamMemberIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const notFoundSchema = z.object({
  error: z.string(),
});
