import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { encodeAgUiSseEvent } from "@engenty/ag-ui-bridge";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { AI_BASE_PATH } from "../config/constants.js";

const DEBUG_EVENT_HISTORY_LIMIT = 300;
const DEBUG_KEEPALIVE_INTERVAL_MS = 25_000;

export interface AgUiDebugEventBus {
  publish: (event: AGUIEvent) => void;
  snapshot: () => AGUIEvent[];
  subscribe: (listener: (event: AGUIEvent) => void) => () => void;
}

// Tiny in-process event fanout used by CopilotKit's VS Code AG-UI Inspector.
// It is intentionally local-dev only and does not persist events.
export function createAgUiDebugEventBus(): AgUiDebugEventBus {
  const history: AGUIEvent[] = [];
  const listeners = new Set<(event: AGUIEvent) => void>();

  return {
    publish(event) {
      history.push(event);
      if (history.length > DEBUG_EVENT_HISTORY_LIMIT) {
        history.splice(0, history.length - DEBUG_EVENT_HISTORY_LIMIT);
      }
      for (const listener of listeners) {
        listener(event);
      }
    },
    snapshot() {
      return [...history];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function isCopilotKitDebugEventsEnabled() {
  return process.env.NODE_ENV !== "production";
}

export function registerCopilotKitDebugEventRoutes(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: { bus: AgUiDebugEventBus }
): void {
  for (const path of [
    `${AI_BASE_PATH}/cpk-debug-events`,
    "/cpk-debug-events",
  ]) {
    app.get(path, (c) => {
      if (!isCopilotKitDebugEventsEnabled()) {
        return c.text(
          "CopilotKit debug events are disabled in production",
          404
        );
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          const enqueue = (chunk: string) => {
            if (closed) {
              return;
            }
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch {
              closed = true;
            }
          };
          const unsubscribe = opts.bus.subscribe((event) => {
            enqueue(encodeAgUiSseEvent(event));
          });
          const keepalive = setInterval(() => {
            enqueue(": keepalive\n\n");
          }, DEBUG_KEEPALIVE_INTERVAL_MS);
          const close = () => {
            if (closed) {
              return;
            }
            closed = true;
            clearInterval(keepalive);
            unsubscribe();
            try {
              controller.close();
            } catch {
              // The browser may already have closed the stream.
            }
          };

          c.req.raw.signal.addEventListener("abort", close, { once: true });
          enqueue(": copilotkit-ag-ui-debug\n\n");
          for (const event of opts.bus.snapshot()) {
            enqueue(encodeAgUiSseEvent(event));
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream",
          "X-Accel-Buffering": "no",
        },
      });
    });
  }
}
