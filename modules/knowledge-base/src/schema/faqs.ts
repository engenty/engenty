import { z } from "zod";
import type { FaqStatus } from "./shared.js";
import { faqStatusSchema } from "./shared.js";
import type { Tag } from "./tags.js";

/* ── FAQ ── */

export interface Faq {
  answer_json: Record<string, unknown> | null;
  answer_markdown: string | null;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
  id: string;
  kb_id: string;
  question: string;
  scope_id: string;
  sort_order: number;
  status: FaqStatus;
  /** Populated when fetching with tags */
  tags?: Tag[];
  tenant_id: string;
  updated_at: string;
}

export type FaqInput = Pick<
  Faq,
  | "kb_id"
  | "question"
  | "answer_json"
  | "answer_markdown"
  | "sort_order"
  | "status"
>;

export type FaqUpdateInput = Partial<Omit<FaqInput, "kb_id">>;

/* ── FAQ ── */

export const faqCreateSchema = z.object({
  kb_id: z.string().min(1),
  question: z.string().min(1).max(1024),
  answer_json: z.record(z.string(), z.unknown()).nullable().optional(),
  answer_markdown: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional().default(0),
  status: faqStatusSchema.optional().default("draft"),
  tag_ids: z.array(z.string()).optional(),
});

export const faqUpdateSchema = faqCreateSchema.omit({ kb_id: true }).partial();
