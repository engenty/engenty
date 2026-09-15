// The other half of the desk marker: after a colleague asked and the desk's
// agent answered in the pair thread, the desk shows WHAT it answered — a
// preview, as the agent's own row — instead of only "Message from …" with
// the answer one click away. The full exchange stays in the pair thread;
// the row's metadata points there.
import { createLogger } from "@engenty/telemetry";
import { scopeAttributionUserId } from "../sessions/types.js";
import {
  AGENT_MESSAGE_MARKER_KEY,
  type AgentMessageMarker,
} from "../threads/agent-pair-thread.js";
import { speakOnDesk } from "../threads/speak-on-desk.js";
import type { DelegationToolDeps } from "./delegate-tool.js";

const logger = createLogger({ name: "desk-reply-preview" });

export const DESK_REPLY_PREVIEW_CHARS = 200;

/** The first ~200 characters of a reply, cut at a word, one paragraph. */
export function previewReplyText(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= DESK_REPLY_PREVIEW_CHARS) {
    return flat;
  }
  const cut = flat.slice(0, DESK_REPLY_PREVIEW_CHARS);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > DESK_REPLY_PREVIEW_CHARS / 2 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

/**
 * Put the desk agent's reply preview into its own desk room. Skipped when
 * the reply is empty or the run has no person to open a desk for; its own
 * failure is logged, never raised — the reply itself already went through.
 */
export async function markDeskReplyPreview(
  deps: DelegationToolDeps,
  input: {
    /** Whose desk — the colleague that answered. */
    agentId: string;
    agentName: string;
    /** Artifacts the colleague wrote or presented while answering. */
    artifactIds?: string[];
    /** Who asked. */
    fromId: string;
    pairThread: { agentId: string; id: string };
    reply: unknown;
    spaceId: string;
  }
): Promise<void> {
  const text = typeof input.reply === "string" ? input.reply.trim() : "";
  if (!text) {
    return;
  }
  try {
    const marker: AgentMessageMarker = {
      agent_id: input.agentId,
      ...(input.artifactIds?.length ? { artifact_ids: input.artifactIds } : {}),
      kind: "reply",
      reply_to_agent_id: input.fromId,
      thread_agent_id: input.pairThread.agentId,
      thread_id: input.pairThread.id,
    };
    const ownerUserId = scopeAttributionUserId(deps.scope);
    await speakOnDesk({
      agentId: input.agentId,
      agentName: input.agentName,
      metadata: { [AGENT_MESSAGE_MARKER_KEY]: marker },
      ownerUserId,
      source: "agent-reply-preview",
      spaceId: input.spaceId,
      store: deps.store,
      tenantId: deps.scope.tenantId,
      text: previewReplyText(text),
      threadSeed: `agent-room:${input.spaceId}:${input.agentId}:${ownerUserId ?? "service"}`,
    });
  } catch (error) {
    logger.warn("desk reply preview failed", {
      agentId: input.agentId,
      error: error instanceof Error ? error.message : String(error),
      threadId: input.pairThread.id,
    });
  }
}
