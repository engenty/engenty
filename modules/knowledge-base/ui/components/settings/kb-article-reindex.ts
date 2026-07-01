import { requestApiJson } from "@engenty/api-client";

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
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<void> {
  const batchSize = options.batchSize ?? 100;
  const statusRes = await requestApiJson<{
    data?: { status?: { total_count?: number } };
    status?: { total_count?: number };
  }>("/api/search-index/providers/kb.article/status", { method: "GET" });
  const total =
    statusRes.status?.total_count ?? statusRes.data?.status?.total_count ?? 0;
  let done = 0;
  while (true) {
    options.onProgress?.(done, total);
    const result = unwrapBackfillResult(
      await requestApiJson<unknown>(
        "/api/search-index/providers/kb.article/backfill",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true, limit: batchSize }),
        }
      )
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
