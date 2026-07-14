import { request } from "./http";

/** One selectable log source: a date-stamped evlog file or the agents stream. */
export interface LogFile {
  date: string;
  label?: string;
}

/** A parsed log line. Fields vary by source, so everything is optional. */
export type LogEntry = Record<string, unknown>;

export interface LogEntriesParams {
  date: string;
  level?: string;
  limit?: number;
  offset?: number;
  search?: string;
}

export interface LogEntriesResult {
  entries: LogEntry[];
  total: number;
}

export function listLogFiles(signal?: AbortSignal) {
  return request<{ files: LogFile[] }>("/api/logs/files", { signal }).then(
    (r) => r.files
  );
}

export function listLogEntries(params: LogEntriesParams, signal?: AbortSignal) {
  const query = new URLSearchParams({ date: params.date });
  if (params.search) {
    query.set("search", params.search);
  }
  if (params.level) {
    query.set("level", params.level);
  }
  query.set("limit", String(params.limit ?? 100));
  query.set("offset", String(params.offset ?? 0));
  return request<LogEntriesResult>(`/api/logs/entries?${query.toString()}`, {
    signal,
  });
}
