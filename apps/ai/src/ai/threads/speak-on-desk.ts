// An Engenty says something on its own desk without a person's turn.
//
// One door for every proactive post — the hire welcome, a routine's settle
// report, the `desk_post` tool, a graph node's card — so they all land in the
// same room (the specialist's shared conversation in the Space), carry the
// same row shape (an assistant row, stable id when the caller has one), and
// tell the people who were not watching the same way (one `update` in the
// inbox, coalesced per agent + Space).
//
// Live refresh needs nothing extra here: `ai.thread_message` inserts bump
// `thread.updated_at` (trigger `thread_message_bump_thread`), the desk
// watches its thread row and re-reads history on every UPDATE.
import type { NotificationTitle } from "@engenty/notifications";
import { createLogger } from "@engenty/telemetry";
import type { ThreadStore } from "../../dal/threads/thread-store.js";
import { emitInboxNotification } from "../../notifications/inbox.js";
import { resolveSpecialistChatThread } from "./specialist-chat-thread.js";

const logger = createLogger({ name: "speak-on-desk" });

/** One inbox row per agent + Space within this window, ×N. */
const NOTIFY_WINDOW_MS = 10 * 60 * 1000;
const SUMMARY_CHARS = 140;

export interface SpeakOnDeskInput {
  agentId: string;
  /** The agent's display name — the inbox line and the created thread's title. */
  agentName?: string | null;
  /** Pin the row's time (a welcome sorts at thread creation, not at LLM settle). */
  createdAt?: string;
  /** Stable id when a replayed caller must upsert instead of posting twice. */
  messageId?: string;
  metadata?: Record<string, unknown>;
  /**
   * Tell the Space: an `update` for the people who were not watching. Off by
   * default — a welcome does not need an inbox row, a report does.
   */
  notify?:
    | boolean
    | {
        /** The line under the title; defaults to the post's first line. */
        body?: string | null;
        /** English fallback line, said whole when the title misses a name. */
        summary?: string;
        /** Overrides the default "{actor} posted an update". */
        title?: NotificationTitle;
      };
  /**
   * The person the post is for — owns the conversation when this call has to
   * open the specialist's first one. Null with no Space thread yet = silence.
   */
  ownerUserId: string | null;
  /** Who is speaking, as an inbox actor; defaults to the agent itself. */
  source?: string;
  spaceId: string | null;
  store: ThreadStore;
  tenantId: string;
  text: string;
  /** Seed for the conversation this creates when the specialist has none. */
  threadSeed?: string;
  /** Title for that conversation; defaults to the agent's name. */
  title?: string;
}

export interface SpeakOnDeskResult {
  messageId: string;
  threadId: string;
}

function firstLine(text: string): string {
  const line =
    text
      .split("\n")
      .map((part) => part.replace(/^[#*>\-\s]+/, "").trim())
      .find((part) => part.length > 0) ?? "";
  return line.length > SUMMARY_CHARS
    ? `${line.slice(0, SUMMARY_CHARS - 1)}…`
    : line;
}

/**
 * Post `text` as the agent's own words on its desk. Null when there is
 * nowhere to speak (no Space, or no person to open the first conversation
 * for) — a real configuration, not an error, so callers log and move on.
 */
export async function speakOnDesk(
  input: SpeakOnDeskInput
): Promise<SpeakOnDeskResult | null> {
  const text = input.text.trim();
  if (!text) {
    return null;
  }
  const source = input.source ?? "desk-post";
  const threadId = await resolveSpecialistChatThread({
    agentId: input.agentId,
    ownerUserId: input.ownerUserId,
    spaceId: input.spaceId,
    store: input.store,
    tenantId: input.tenantId,
    threadSeed:
      input.threadSeed ??
      `desk:${input.spaceId ?? "tenant"}:${input.agentId}:${input.ownerUserId ?? "service"}`,
    title: input.title?.trim() || input.agentName?.trim() || input.agentId,
  });
  if (!threadId) {
    return null;
  }
  const { message } = await input.store.appendMessage({
    authorUserId: null,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    ...(input.messageId ? { id: input.messageId } : {}),
    metadata: { source, ...(input.metadata ?? {}) },
    parts: [{ text, type: "text" }],
    role: "assistant",
    tenantId: input.tenantId,
    threadId,
  });
  if (input.notify && input.spaceId) {
    const notify = typeof input.notify === "object" ? input.notify : {};
    const line = notify.body?.trim() ? firstLine(notify.body) : firstLine(text);
    const name = input.agentName?.trim();
    // Fallback only — the title below is what the row says. Never the id.
    const summary =
      notify.summary?.trim() || (name ? `${name}: ${line}` : line);
    try {
      await emitInboxNotification({
        actor: { id: input.agentId, kind: "agent" },
        audience: { kind: "space", spaceId: input.spaceId },
        coalesceKey: `agent:${input.agentId}:agent_desk_post:${input.spaceId}`,
        coalesceWindowMs: NOTIFY_WINDOW_MS,
        kind: "agent_desk_post",
        metadata: {
          agent_id: input.agentId,
          message_id: message.id,
          thread_agent_id: input.agentId,
          thread_id: threadId,
        },
        priority: "low",
        source: "agents",
        spaceId: input.spaceId,
        subject: { id: threadId, type: "thread" },
        summary,
        tenantId: input.tenantId,
        ...(line ? { body: line } : {}),
        // `{actor}` is the agent, resolved to its name at emit.
        title: notify.title ?? { key: "agent_desk_post" },
      });
    } catch (error) {
      logger.warn("desk post notification failed", {
        agentId: input.agentId,
        error: error instanceof Error ? error.message : String(error),
        threadId,
      });
    }
  }
  return { messageId: message.id, threadId };
}
