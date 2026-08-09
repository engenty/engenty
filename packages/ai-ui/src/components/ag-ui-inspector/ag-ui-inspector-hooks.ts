import { createAgUiSseParser, EventType } from "@engenty/ag-ui-bridge";
import {
  getDeveloperModePreference,
  isEngentyDevelopmentEnvironment,
  subscribeDeveloperModePreference,
} from "@engenty/environment";
import { useCallback, useEffect, useState } from "react";
import type { EngentyAgUiEvent } from "../../ag-ui/conversation.js";

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

/**
 * `/ai/cpk-debug-events` is a SERVER-WIDE firehose: it carries every run's
 * events, not this thread's. Without a reset the panel accumulates the last 600
 * events across every chat the server handled, so opening a new chat still
 * showed the previous conversation's stream — indistinguishable from "the new
 * run replayed old messages". `resetKey` (the active thread id) drops the
 * buffer whenever the user switches or starts a chat; `clear` is the manual
 * escape hatch for a long-running thread.
 */
export function useAgUiDebugEvents(
  serviceBaseUrl: string,
  enabled: boolean,
  resetKey?: string | null
): { clear: () => void; events: EngentyAgUiEvent[] } {
  const [events, setEvents] = useState<EngentyAgUiEvent[]>([]);
  const clear = useCallback(() => setEvents([]), []);

  // Separate from the stream effect: re-subscribing on every thread switch
  // would drop events mid-run for no reason — only the buffer resets.
  useEffect(() => {
    setEvents([]);
  }, [resetKey]);

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
            [...current, ...(chunkEvents as EngentyAgUiEvent[])].slice(
              -DEBUG_EVENT_LIMIT
            )
          );
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setEvents((current) => [
            ...current,
            {
              type: EventType.RUN_ERROR,
              message:
                error instanceof Error
                  ? error.message
                  : "AG-UI inspector stream failed",
            } as EngentyAgUiEvent,
          ]);
        }
      }
    })();

    return () => abort.abort();
  }, [enabled, serviceBaseUrl]);

  return { clear, events };
}
