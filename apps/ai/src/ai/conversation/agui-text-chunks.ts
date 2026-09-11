// `TEXT_MESSAGE_CHUNK` → `TEXT_MESSAGE_START` / `CONTENT` / `END`.
//
// AG-UI's CHUNK event is a compression of those three, and `@ag-ui/mastra` emits
// only the compressed form. `@ag-ui/client`'s pipeline expands it on the way to a
// renderer — but this codebase's wire is defined on the EXPANDED form in three
// places that never see that pipeline:
//
//   - `run-tracking` coalesces TEXT_MESSAGE_CONTENT deltas into merged rows. A
//     long answer is thousands of deltas; uncoalesced CHUNK rows would be one
//     database row per token.
//   - every replay reads those rows back.
//   - the interrupt/park paths reason about an OPEN text message (a partial
//     answer before a suspend still has to be well-formed START → CONTENT → END).
//
// Expanding here rather than letting the client pipeline do it is also what keeps
// a partial answer: the pipeline BUFFERS, so a stream that dies mid-text delivers
// the START and drops the text — for exactly the failure the transcript safety
// net exists to rescue.
import { type AGUIEvent, EventType } from "@engenty/ag-ui-bridge";

/**
 * Expands text chunks and tracks which messages are open.
 *
 * Stateful because END is only correct once, and only for a message that was
 * actually started — a spec-compliant AG-UI client rejects a stray END outright.
 */
export class AgUiTextChunkExpander {
  readonly #open = new Set<string>();

  /** One inbound event, as zero or more outbound ones. Non-text passes through. */
  expand(event: AGUIEvent): AGUIEvent[] {
    const e = event as unknown as {
      delta?: unknown;
      messageId?: unknown;
      role?: unknown;
      type?: unknown;
    };
    if (e.type !== EventType.TEXT_MESSAGE_CHUNK) {
      // A producer that already emits the expanded form keeps its own bookkeeping
      // — track it so `finish()` does not close a message twice.
      if (
        e.type === EventType.TEXT_MESSAGE_START &&
        typeof e.messageId === "string"
      ) {
        this.#open.add(e.messageId);
      }
      if (
        e.type === EventType.TEXT_MESSAGE_END &&
        typeof e.messageId === "string"
      ) {
        this.#open.delete(e.messageId);
      }
      return [event];
    }
    const messageId =
      (typeof e.messageId === "string" && e.messageId) || "assistant";
    const out: AGUIEvent[] = [];
    if (!this.#open.has(messageId)) {
      this.#open.add(messageId);
      out.push({
        messageId,
        role: typeof e.role === "string" ? e.role : "assistant",
        type: EventType.TEXT_MESSAGE_START,
      } as AGUIEvent);
    }
    const delta = typeof e.delta === "string" ? e.delta : "";
    if (delta) {
      out.push({
        delta,
        messageId,
        type: EventType.TEXT_MESSAGE_CONTENT,
      } as AGUIEvent);
    }
    return out;
  }

  /** Close whatever is still open. Call once the stream ends, however it ended. */
  finish(): AGUIEvent[] {
    const out: AGUIEvent[] = [];
    for (const messageId of this.#open) {
      out.push({ messageId, type: EventType.TEXT_MESSAGE_END } as AGUIEvent);
    }
    this.#open.clear();
    return out;
  }
}
