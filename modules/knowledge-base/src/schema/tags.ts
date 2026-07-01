import { z } from "zod";
import { slugSchema } from "./shared.js";

/* ── Tag ── */

export interface Tag {
  color: string | null;
  created_at: string;
  id: string;
  kb_id: string;
  name: string;
  scope_id: string;
  slug: string;
  tenant_id: string;
}

export type TagInput = Pick<Tag, "kb_id" | "name" | "slug" | "color">;

/* ── Tag ── */

export const tagCreateSchema = z.object({
  kb_id: z.string().min(1),
  name: z.string().min(1).max(128),
  slug: slugSchema,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});
