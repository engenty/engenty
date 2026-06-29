import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  type DevPluginReloadEventHub,
  encodeDevPluginReloadSseEvent,
  shouldEnableDevPluginReloadBrowserEvents,
} from "../../../plugins/dev-reload-events.js";

export function registerPluginDevReloadEventsRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  hub: DevPluginReloadEventHub;
}) {
  params.app.get("/api/plugins/dev-reload-events", (c) => {
    if (!shouldEnableDevPluginReloadBrowserEvents(params.config)) {
      return c.json(
        {
          ok: false,
          error: {
            code: "not_found",
            message: "Not found",
          },
        },
        404
      );
    }

    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    let closed = false;
    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      unsubscribe();
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": ready\n\n"));
        unsubscribe = params.hub.subscribe((event) => {
          if (!closed) {
            controller.enqueue(
              encoder.encode(encodeDevPluginReloadSseEvent(event))
            );
          }
        });
        c.req.raw.signal.addEventListener("abort", close, { once: true });
      },
      cancel() {
        close();
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    });
  });
}
