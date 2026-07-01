import { useTranslation } from "@engenty/i18n/ui";
import { cn, Progress } from "@engenty/ui-core";

import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { useEffect, useState } from "react";
import type { KbSourceRun } from "../../src/schema/sources.js";

/**
 * Compact progress banner shown above the items panel while a run is active.
 * Shows a determinate progress bar when the total item count is known (from
 * source settings `limit`), and an animated sweep otherwise.
 */
export function SourceRunProgressBanner({
  run,
  settingsLimit,
}: {
  run: KbSourceRun;
  settingsLimit: number | null;
}) {
  const { t } = useTranslation("kb");

  const processed = run.created_items + run.updated_items + run.skipped_items;
  const metadataTotal =
    typeof run.metadata.total_items === "number"
      ? run.metadata.total_items
      : null;
  const currentItemIndex =
    typeof run.metadata.current_item_index === "number"
      ? run.metadata.current_item_index
      : processed;
  const total =
    metadataTotal ??
    (settingsLimit && settingsLimit > 0 ? settingsLimit : null);
  const pct = total
    ? Math.min(
        100,
        Math.round((Math.max(currentItemIndex, processed) / total) * 100)
      )
    : null;

  // Animated sweep for the indeterminate case
  const [sweepVal, setSweepVal] = useState(0);
  useEffect(() => {
    if (pct !== null) {
      setSweepVal(0);
      return;
    }
    let forward = true;
    const tick = setInterval(() => {
      setSweepVal((v) => {
        if (forward) {
          if (v >= 85) {
            forward = false;
            return v - 2;
          }
          return Math.min(v + 3, 85);
        }
        if (v <= 15) {
          forward = true;
          return v + 2;
        }
        return Math.max(v - 3, 15);
      });
    }, 40);
    return () => clearInterval(tick);
  }, [pct]);

  const barValue = pct ?? sweepVal;

  return (
    <div className="ui-canvas-panel relative overflow-hidden rounded-lg border-0 bg-card">
      {/* Background progress fill */}
      <Progress
        className={cn(
          "absolute inset-0 h-full rounded-none opacity-[0.12]",
          "[&>div]:rounded-none [&>div]:transition-none"
        )}
        value={barValue}
      />

      {/* Foreground content */}
      <div className="relative flex items-center gap-2.5 px-4 py-2.5">
        <AnimatedLoaderIcon
          className="shrink-0 text-primary"
          play="always"
          size="xs"
        />
        <span className="font-medium text-sm">
          {total
            ? t("sources.run_progress_retrieving", {
                count: Math.max(currentItemIndex, processed),
                total,
              })
            : t("sources.run_progress_count", { count: processed })}
        </span>
        {pct !== null && (
          <span className="ml-auto text-muted-foreground text-xs tabular-nums">
            {pct}%
          </span>
        )}
      </div>
    </div>
  );
}
