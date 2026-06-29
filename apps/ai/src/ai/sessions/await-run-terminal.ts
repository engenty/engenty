// Shared helper: wait for a run to reach a terminal event (finished/error) or timeout.
import { isRunLiveInProcess, subscribeRunEvents } from "./run-event-bus.js";

export type RunTerminalOutcome = "finished" | "error" | "timeout";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export function awaitRunTerminal(
  runId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<RunTerminalOutcome> {
  return new Promise((resolve) => {
    if (!isRunLiveInProcess(runId)) {
      resolve("finished");
      return;
    }

    const timer = setTimeout(() => {
      unsubscribe();
      resolve("timeout");
    }, timeoutMs);

    const unsubscribe = subscribeRunEvents(runId, (busEvent) => {
      const eventType = (busEvent.event as { type?: string }).type;
      if (eventType === "RUN_FINISHED") {
        clearTimeout(timer);
        unsubscribe();
        resolve("finished");
      } else if (eventType === "RUN_ERROR") {
        clearTimeout(timer);
        unsubscribe();
        resolve("error");
      }
    });
  });
}
