import { requestApiJson } from "@engenty/api-client";

const KB_PROVIDER_PATH = "/api/search-index/providers/kb.article";

export interface KbSearchIndexStatus {
  current_count: number;
  indexed_count: number;
  last_indexed_at: string | null;
  missing_count: number;
  stale_count: number;
  total_count: number;
}

export async function fetchKbSearchIndexStatus(): Promise<KbSearchIndexStatus> {
  const res = await requestApiJson<{
    data?: { status?: KbSearchIndexStatus };
    status?: KbSearchIndexStatus;
  }>(`${KB_PROVIDER_PATH}/status`, { method: "GET" });
  const status = res.status ?? res.data?.status;
  if (!status) {
    throw new Error("Search index status missing from response");
  }
  return status;
}

interface KbArticleReindexBackfillResult {
  processed: number;
  results: Array<{ article_id: string; error?: string; ok: boolean }>;
}

function unwrapBackfillResult(raw: unknown): KbArticleReindexBackfillResult {
  const body = raw as {
    data?: { result?: KbArticleReindexBackfillResult };
    result?: KbArticleReindexBackfillResult;
  };
  return (body.result ??
    body.data?.result ??
    raw) as KbArticleReindexBackfillResult;
}

export async function runKbArticleReindex(
  options: {
    batchSize?: number;
    /** Narrow to one library (`{ kb_id }`); the provider filters its own rows. */
    metadata?: Record<string, string>;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<void> {
  const batchSize = options.batchSize ?? 100;
  const statusRes = await requestApiJson<{
    data?: { status?: { total_count?: number } };
    status?: { total_count?: number };
  }>(`${KB_PROVIDER_PATH}/status`, { method: "GET" });
  const total =
    statusRes.status?.total_count ?? statusRes.data?.status?.total_count ?? 0;
  let done = 0;
  while (true) {
    options.onProgress?.(done, total);
    const result = unwrapBackfillResult(
      await requestApiJson<unknown>(`${KB_PROVIDER_PATH}/backfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force: true,
          limit: batchSize,
          ...(options.metadata ? { metadata: options.metadata } : {}),
        }),
      })
    );
    done += result.processed;
    const failedRow = result.results.find((row) => !row.ok);
    if (failedRow) {
      throw new Error(
        `${failedRow.error ?? "embed_failed"} (${failedRow.article_id})`
      );
    }
    if (result.processed === 0 || result.processed < batchSize) {
      break;
    }
  }
  options.onProgress?.(done, total);
}
