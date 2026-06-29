import { type AGUIEvent, createAgUiSseParser } from "@engenty/ag-ui-bridge";
import {
  getDeveloperModePreference,
  isEngentyDevelopmentEnvironment,
  subscribeDeveloperModePreference,
} from "@engenty/environment";
import { useEffect, useState } from "react";

const DEBUG_EVENT_LIMIT = 600;

export function useDeveloperModeEnabled() {
  const [enabled, setEnabled] = useState(
    () => isEngentyDevelopmentEnvironment() && getDeveloperModePreference()
  );
  useEffect(() => {
    if (!isEngentyDevelopmentEnvironment()) {
      setEnabled(false);
      return;
    }
    return subscribeDeveloperModePreference(() => {
      setEnabled(getDeveloperModePreference());
    });
  }, []);
  return enabled;
}

export function useAgUiDebugEvents(serviceBaseUrl: string, enabled: boolean) {
  const [events, setEvents] = useState<AGUIEvent[]>([]);

  useEffect(() => {
    if (!(enabled && serviceBaseUrl)) {
      setEvents([]);
      return;
    }
    const abort = new AbortController();
    const parser = createAgUiSseParser();
    const url = `${serviceBaseUrl.replace(/\/$/, "")}/ai/cpk-debug-events`;

    void (async () => {
      try {
        const response = await fetch(url, {
          headers: { Accept: "text/event-stream" },
          signal: abort.signal,
        });
        if (!(response.ok && response.body)) {
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const chunkEvents = parser.push(
            decoder.decode(value, { stream: true })
          );
          if (chunkEvents.length === 0) {
            continue;
          }
          setEvents((current) =>
            [...current, ...chunkEvents].slice(-DEBUG_EVENT_LIMIT)
          );
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setEvents((current) => [
            ...current,
            {
              type: "RUN_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "AG-UI inspector stream failed",
            } as AGUIEvent,
          ]);
        }
      }
    })();

    return () => abort.abort();
  }, [enabled, serviceBaseUrl]);

  return events;
}
