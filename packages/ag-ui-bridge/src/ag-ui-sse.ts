import type { AGUIEvent } from "@ag-ui/core";
import { EventSchemas } from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";

/**
 * Encode one AG-UI event as an SSE frame, optionally carrying `id:`.
 *
 * `@ag-ui/encoder`'s `encodeSSE` emits `data: {...}` and nothing else, so a stream
 * produced with it cannot be resumed — there is no cursor on the wire. AG-UI
 * nonetheless declares the capability: `TransportCapabilities.resumable` is
 * documented as "the agent supports resuming interrupted streams via sequence
 * numbers". This fills that gap the way SSE already provides for: the `id:` field,
 * which browsers echo back as `Last-Event-ID` on automatic reconnect.
 *
 * `id` is omitted when not supplied, so existing callers are byte-for-byte
 * unchanged. Upstream proposal: `EventEncoder.encodeSSE(event, id?)`.
 */
export function encodeAgUiSseEvent(
  event: AGUIEvent,
  id?: number | string
): string {
  const frame = new EventEncoder().encodeSSE(event);
  return id === undefined ? frame : `id: ${id}\n${frame}`;
}

export function parseAgUiSseChunk(chunk: string): AGUIEvent[] {
  return chunk
    .split("\n\n")
    .flatMap((eventBlock) =>
      eventBlock
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length))
    )
    .flatMap((payload) => {
      try {
        const parsed = EventSchemas.safeParse(JSON.parse(payload));
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    });
}

/**
 * Streaming SSE parser. `lastEventId()` returns the most recent `id:` seen, which
 * is the cursor to resume from — see `encodeAgUiSseEvent`. It stays null against a
 * server that does not emit ids (including any stock `@ag-ui/encoder` server), so
 * callers must treat resumption as unavailable rather than assuming a cursor.
 */
export function createAgUiSseParser(): {
  flush: () => AGUIEvent[];
  lastEventId: () => string | null;
  push: (chunk: string) => AGUIEvent[];
} {
  let buffer = "";
  let lastId: string | null = null;
  const trackIds = (text: string): void => {
    for (const line of text.split("\n")) {
      if (line.startsWith("id: ")) {
        lastId = line.slice("id: ".length).trim();
      }
    }
  };
  return {
    lastEventId() {
      return lastId;
    },
    flush() {
      const events = parseAgUiSseChunk(buffer);
      buffer = "";
      return events;
    },
    push(chunk: string) {
      buffer += chunk;
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      if (blocks.length === 0) {
        return [];
      }
      const complete = `${blocks.join("\n\n")}\n\n`;
      // Only from COMPLETE frames: a half-received frame's id must not advance the
      // cursor, or a reconnect would skip the event it belongs to.
      trackIds(complete);
      return parseAgUiSseChunk(complete);
    },
  };
}
