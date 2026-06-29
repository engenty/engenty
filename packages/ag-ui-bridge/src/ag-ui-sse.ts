import type { AGUIEvent } from "@ag-ui/core";
import { EventSchemas } from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";

export function encodeAgUiSseEvent(event: AGUIEvent): string {
  return new EventEncoder().encodeSSE(event);
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

export function createAgUiSseParser(): {
  flush: () => AGUIEvent[];
  push: (chunk: string) => AGUIEvent[];
} {
  let buffer = "";
  return {
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
      return parseAgUiSseChunk(`${blocks.join("\n\n")}\n\n`);
    },
  };
}
