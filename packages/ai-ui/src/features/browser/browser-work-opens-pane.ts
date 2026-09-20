import { useEffect, useRef } from "react";

import type { EngentyAgUiEvent } from "../../ag-ui/conversation.js";
import { setUserBrowserPaneOpen } from "./user-browser-pane-store.js";

/**
 * The agent's own browser tools (`browser_goto`, `browser_run_fast`, …) as
 * they appear on the run-event lane. The in-app UI tools (`ui_click`,
 * `navigate`) are not browser work and never open the pane.
 */
const BROWSER_TOOL_PREFIX = "browser_";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The runs in which the agent picked up its browser, from the live event
 * stream: a `TOOL_CALL_START` naming a `browser_*` tool, attributed to the
 * most recent `RUN_STARTED` before it. Pure so the panel logic is testable.
 */
export function runsWithBrowserWork(
  events: readonly EngentyAgUiEvent[]
): string[] {
  const runs: string[] = [];
  let currentRun: string | null = null;
  for (const event of events) {
    if (event.type === "RUN_STARTED") {
      currentRun = readString(event.runId);
      continue;
    }
    if (event.type !== "TOOL_CALL_START") {
      continue;
    }
    const name = readString(event.toolCallName);
    if (!name?.startsWith(BROWSER_TOOL_PREFIX)) {
      continue;
    }
    const run = currentRun ?? readString(event.toolCallId) ?? name;
    if (!runs.includes(run)) {
      runs.push(run);
    }
  }
  return runs;
}

/**
 * Open the person's browser pane the moment the agent starts working in
 * their browser, once per run. Closing the pane mid-run is respected: the
 * same run does not reopen it, the next run that touches the browser does.
 */
export function useBrowserWorkOpensPane(
  events: readonly EngentyAgUiEvent[]
): void {
  const openedFor = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const run of runsWithBrowserWork(events)) {
      if (openedFor.current.has(run)) {
        continue;
      }
      openedFor.current.add(run);
      setUserBrowserPaneOpen(true);
    }
  }, [events]);
}
