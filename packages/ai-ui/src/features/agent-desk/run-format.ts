// Shared run formatting for the list row and the detail header, so a run's
// duration never reads differently in two places.
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";

/** How long it ran, once it has finished. */
export function runDuration(run: AiAgentRunSummary): string | null {
  const start = run.started_at ?? run.created_at;
  if (!(start && run.finished_at)) {
    return null;
  }
  const ms = Date.parse(run.finished_at) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function runStamp(
  value: string | null | undefined,
  locale: string
): string {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString(locale);
}
