/**
 * Step 4 — create the source and fetch a sample.
 *
 * This is the step that turns a form into evidence. Instead of asking the user
 * to describe how the material should be filed and only finding out afterwards
 * that the crawl returned cookie banners, the wizard fetches a handful of
 * entries here and shows exactly what came back. The plan step that follows —
 * including the analyzer — then has real text to work from.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { AlertTriangle, Check, FileText } from "lucide-react";
import type { KbSourceItem } from "../../../src/schema/types.js";
import { WizardStepHeader } from "./wizard-chrome.js";

export function WizardStepFetch({
  busy,
  error,
  items,
  onRetry,
  readyItemIds,
  remainingCount,
  sourceCount,
}: {
  busy: boolean;
  error: string | null;
  items: KbSourceItem[];
  onRetry: () => void;
  /** Items that actually carry content, decided by the page. */
  readyItemIds: ReadonlySet<string>;
  /** Entries deliberately left for the full sync started on finish. */
  remainingCount: number;
  sourceCount: number;
}) {
  const { t } = useTranslation("kb");
  const nothingCameBack = !(busy || error) && items.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <WizardStepHeader
        description={t("sources.wizard_fetch_desc")}
        title={t("sources.wizard_fetch_title")}
      />

      {error ? (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="flex items-start gap-2 text-destructive text-sm">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
          </p>
          <div>
            <Button onClick={onRetry} size="sm" type="button" variant="outline">
              {t("sources.wizard_fetch_retry")}
            </Button>
          </div>
        </div>
      ) : null}

      {busy ? (
        // A div, not a p: the loader renders a <div>, which is invalid inside
        // a paragraph and trips React's hydration validation.
        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-3 text-sm">
          <AnimatedLoaderIcon play="always" size="sm" />
          {t("sources.wizard_fetch_running")}
        </div>
      ) : null}

      {!(busy || error) && sourceCount > 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-3 text-sm">
          <Check aria-hidden className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            {t("sources.wizard_fetch_created", { count: sourceCount })}
            {remainingCount > 0
              ? ` ${t("sources.wizard_fetch_remaining", {
                  count: remainingCount,
                })}`
              : ""}
          </span>
        </p>
      ) : null}

      {nothingCameBack && sourceCount > 0 ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-900 text-sm dark:text-amber-100">
          {t("sources.wizard_fetch_empty")}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-2">
          <p className="font-medium text-sm">
            {t("sources.wizard_fetch_preview", {
              fetched: readyItemIds.size,
              total: items.length,
            })}
          </p>
          <ul className="divide-y rounded-lg border">
            {items.map((item) => {
              const ready = readyItemIds.has(item.id);
              return (
                <li
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                  key={item.id}
                >
                  <FileText
                    aria-hidden
                    className={cn(
                      "h-4 w-4 shrink-0",
                      ready ? "text-emerald-600" : "text-muted-foreground/50"
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {item.title || item.source_url || item.adapter_item_key}
                  </span>
                  {ready ? null : (
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {t("sources.wizard_fetch_item_pending")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
