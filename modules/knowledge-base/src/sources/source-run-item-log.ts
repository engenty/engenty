import type { DocumentSourceIndexEntry } from "@engenty/document-sources";
import { truncateRunError } from "./run-error-format.js";

export type KbSourceRunItemLogOutcome =
  | "created"
  | "failed"
  | "skipped_ignored"
  | "skipped_unchanged"
  | "updated";

export interface KbSourceRunItemLog {
  item_key: string;
  message: string | null;
  outcome: KbSourceRunItemLogOutcome;
  source_url: string | null;
  title: string | null;
}

export function itemLogFromEntry(
  entry: DocumentSourceIndexEntry,
  outcome: KbSourceRunItemLogOutcome,
  message: string | null = null
): KbSourceRunItemLog {
  return {
    item_key: entry.item_key,
    message,
    outcome,
    source_url: entry.source_url ?? null,
    title: entry.title ?? null,
  };
}

export function summarizeRunItemLogs(
  logs: readonly KbSourceRunItemLog[]
): string | null {
  const failed = logs.filter((log) => log.outcome === "failed");
  if (failed.length === 0) {
    return null;
  }
  if (failed.length === logs.length) {
    return `${failed.length} item(s) failed to retrieve`;
  }
  return `${failed.length} of ${logs.length} item(s) failed to retrieve`;
}

export function resolveRunStatusFromItemLogs(
  logs: readonly KbSourceRunItemLog[]
): "failed" | "succeeded" {
  return logs.some((log) => log.outcome === "failed") ? "failed" : "succeeded";
}

export function parseRunItemLogs(
  metadata: Record<string, unknown> | undefined
): KbSourceRunItemLog[] {
  const raw = metadata?.item_logs;
  if (!Array.isArray(raw)) {
    return [];
  }
  const logs: KbSourceRunItemLog[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const outcome = row.outcome;
    if (
      outcome !== "created" &&
      outcome !== "updated" &&
      outcome !== "skipped_ignored" &&
      outcome !== "skipped_unchanged" &&
      outcome !== "failed"
    ) {
      continue;
    }
    logs.push({
      item_key: String(row.item_key ?? ""),
      message:
        row.message === null || row.message === undefined
          ? null
          : String(row.message),
      outcome,
      source_url:
        row.source_url === null || row.source_url === undefined
          ? null
          : String(row.source_url),
      title:
        row.title === null || row.title === undefined
          ? null
          : String(row.title),
    });
  }
  return logs.filter((log) => log.item_key.length > 0);
}

export function truncateItemLogMessage(message: string): string {
  return truncateRunError(message).slice(0, 2000);
}
