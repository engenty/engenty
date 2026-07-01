import { z } from "zod";

/* ── Attachment ── */

export interface Attachment {
  article_id: string;
  created_at: string;
  filename: string;
  id: string;
  mime_type: string;
  scope_id: string;
  size_bytes: number;
  storage_key: string;
  tenant_id: string;
}

export type AttachmentInput = Pick<
  Attachment,
  "article_id" | "filename" | "storage_key" | "mime_type" | "size_bytes"
>;

/* ── Attachment ── */

export const attachmentCreateSchema = z.object({
  article_id: z.string().min(1),
  filename: z.string().min(1).max(512),
  storage_key: z.string().min(1),
  mime_type: z.string().min(1).default("application/octet-stream"),
  size_bytes: z.number().int().min(0).default(0),
});
