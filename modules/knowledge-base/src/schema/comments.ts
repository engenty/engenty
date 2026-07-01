import { z } from "zod";

/** Resolved comments policy (no inherit). */
export type KbEffectiveCommentsMode = "none" | "enabled" | "closed";

/** KB root — no inherit. */
export type KbRootCommentsMode = KbEffectiveCommentsMode;

/** Category / article binding — may inherit from parent chain or KB. */
export type KbCommentsModeBinding = "inherit" | KbEffectiveCommentsMode;

export const kbEffectiveCommentsModeSchema = z.enum([
  "none",
  "enabled",
  "closed",
]);

export const kbRootCommentsModeSchema = kbEffectiveCommentsModeSchema;

export const kbCommentsModeBindingSchema = z.enum([
  "inherit",
  "none",
  "enabled",
  "closed",
]);

export interface ArticleComment {
  article_id: string;
  content: string;
  created_at: string;
  created_by: string | null;
  id: string;
  scope_id: string;
  tenant_id: string;
  updated_at: string;
}

export const articleCommentCreateSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
});

export const articleCommentUpdateSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
});
