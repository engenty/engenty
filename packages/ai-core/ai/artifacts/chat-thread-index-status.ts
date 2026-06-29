/**
 * Copilot artifact payload for chat-session search index health notices.
 * Index health is surfaced in tool JSON; this schema documents the shape only.
 */
import { z } from "zod";

export const CHAT_THREAD_INDEX_STATUS_ARTIFACT_ID =
  "engenty.chat_session_index_status" as const;

export const chatThreadIndexStatusPayloadSchema = z.object({
  headline: z.string(),
  hint: z.string().optional(),
  index_health: z.enum(["degraded", "missing", "ok"]),
  /** When present, search still returned this many hits despite a non-ok index. */
  match_count: z.number().int().min(0).optional(),
  ok: z.boolean(),
});

export type ChatThreadIndexStatusPayload = z.infer<
  typeof chatThreadIndexStatusPayloadSchema
>;
