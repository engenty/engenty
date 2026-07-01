/**
 * Knowledge Base — filesystem sync UI API client.
 *
 * Talks to the `kb-filesystem-sync` module's manual routes. When that module
 * is not installed the routes 404 and callers surface a graceful fallback.
 */

import { requestApiJson } from "@engenty/api-client";

export interface KbSyncStatus {
  db: { articles: number; categories: number; kb_exists: boolean };
  in_sync: boolean;
  kb_id: string;
  storage: { articles: number; categories: number; kb_index: boolean };
}

export interface KbSyncExportResult {
  articles: number;
  categories: number;
  kb_id: string;
}

export interface KbSyncImportResult {
  articles: number;
  categories: number;
  kb_imported: boolean;
}

const API = "/api/kb-sync";

export async function getKbSyncStatus(
  kbId: string,
  signal?: AbortSignal
): Promise<KbSyncStatus> {
  return requestApiJson<KbSyncStatus>(
    `${API}/status?kb_id=${encodeURIComponent(kbId)}`,
    { method: "GET", signal }
  );
}

export async function exportKbSync(kbId: string): Promise<KbSyncExportResult> {
  return requestApiJson<KbSyncExportResult>(`${API}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kb_id: kbId }),
  });
}

export async function importKbSync(kbId: string): Promise<KbSyncImportResult> {
  return requestApiJson<KbSyncImportResult>(`${API}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kb_id: kbId }),
  });
}
