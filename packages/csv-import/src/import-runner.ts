import type { ImportRunProgress, ImportRunSummary } from "./types.js";

export interface RunImportOptions<T> {
  items: T[];
  onItem: (item: T, index: number) => Promise<void>;
  onProgress?: (progress: ImportRunProgress) => void;
  shouldCancel?: () => boolean;
}

export async function runImport<T>(
  options: RunImportOptions<T>
): Promise<ImportRunSummary> {
  const total = options.items.length;
  let processed = 0;
  let success = 0;
  let failed = 0;
  let canceled = false;

  for (const [index, item] of options.items.entries()) {
    if (options.shouldCancel?.()) {
      canceled = true;
      break;
    }
    try {
      await options.onItem(item, index);
      success += 1;
    } catch {
      failed += 1;
    } finally {
      processed += 1;
      options.onProgress?.({
        total,
        processed,
        success,
        failed,
        canceled: false,
        currentLabel: `${processed}/${total}`,
      });
    }
  }

  const summary = { total, processed, success, failed, canceled };
  options.onProgress?.({
    ...summary,
    currentLabel: canceled ? "canceled" : "done",
  });
  return summary;
}
