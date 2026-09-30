/**
 * The thread's composer mode, kept on the thread (`metadata.chat_mode`).
 *
 * Written after each fresh turn from what the turn ran on, and removed when
 * a chapter is cut: a thread that went to Extra (or a Custom model) stays
 * there until its next chapter, because leaving it earlier would restart the
 * prompt cache on another model. Absent = Normal. The composer reads it to
 * show the thread's mode; Auto reads it to keep a high thread on high.
 */

import {
  type AiEffort,
  type AiReasoningEffort,
  isReasoningEffort,
} from "@engenty/ai-core";

export const CHAT_MODE_METADATA_KEY = "chat_mode";

export type ThreadChatMode =
  | { mode: "extra"; reasoning_effort: AiReasoningEffort | null }
  | {
      mode: "custom";
      model_id: string;
      reasoning_effort: AiReasoningEffort | null;
    };

export function readThreadChatMode(
  metadata: Record<string, unknown> | null | undefined
): ThreadChatMode | null {
  const raw = metadata?.[CHAT_MODE_METADATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const reasoning = isReasoningEffort(record.reasoning_effort)
    ? record.reasoning_effort
    : null;
  if (record.mode === "extra") {
    return { mode: "extra", reasoning_effort: reasoning };
  }
  if (
    record.mode === "custom" &&
    typeof record.model_id === "string" &&
    record.model_id.trim()
  ) {
    return {
      mode: "custom",
      model_id: record.model_id.trim(),
      reasoning_effort: reasoning,
    };
  }
  return null;
}

/** The mode a turn leaves the thread on; null = Normal. */
export function chatModeAfterRun(input: {
  effort: AiEffort | null;
  modelIdOverride: string | null;
  reasoningEffort: AiReasoningEffort | null;
}): ThreadChatMode | null {
  if (input.modelIdOverride) {
    return {
      mode: "custom",
      model_id: input.modelIdOverride,
      reasoning_effort: input.reasoningEffort,
    };
  }
  return input.effort === "high"
    ? { mode: "extra", reasoning_effort: input.reasoningEffort }
    : null;
}

export function sameChatMode(
  a: ThreadChatMode | null,
  b: ThreadChatMode | null
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
