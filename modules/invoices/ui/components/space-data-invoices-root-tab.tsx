/**
 * The `Invoices` root, contributed to the space Data pane.
 *
 * The generic view of this folder is five words. What a receivables index owes
 * its reader is how many are in each state and what they are worth — and one
 * number that is not a per-state total at all: how much of the outstanding
 * money is already late.
 *
 * `invoices_list` takes no filter and no paging, so the whole list arrives in
 * one request and every figure here is grouped from that same array. Nothing is
 * counted twice and no two cards can disagree.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Spinner, uiStatusCardClassName } from "@engenty/ui-core";
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import type { InvoiceStatus } from "../api.js";
import { isInvoiceOverdue } from "../lib/invoice-overdue.js";
import { useInvoicesListQuery } from "../queries.js";

/** One entry of the host's listing, as much of it as this view reads. */
interface FolderRow {
  name: string;
  path: string;
}

function isFolderRow(value: unknown): value is FolderRow {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.name === "string" && typeof row.path === "string";
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    currency,
    style: "currency",
  }).format(value);
}

export function SpaceDataInvoicesRootTab({ params }: UiTabRenderProps) {
  const { t } = useTranslation("invoices");
  const { spaceKey = "" } = useParams();
  const folders = useMemo(
    () =>
      Array.isArray(params.folders) ? params.folders.filter(isFolderRow) : [],
    [params.folders]
  );
  const query = useInvoicesListQuery();

  const summary = useMemo(() => {
    const byStatus = new Map<InvoiceStatus, { count: number; sum: number }>();
    let overdueSum = 0;
    let overdueCount = 0;
    for (const invoice of query.data ?? []) {
      const bucket = byStatus.get(invoice.status) ?? { count: 0, sum: 0 };
      bucket.count += 1;
      bucket.sum += invoice.sumBrutto ?? 0;
      byStatus.set(invoice.status, bucket);
      if (isInvoiceOverdue(invoice)) {
        overdueCount += 1;
        overdueSum += invoice.sumBrutto ?? 0;
      }
    }
    return { byStatus, overdueCount, overdueSum };
  }, [query.data]);

  // Every invoice carries its own currency; mixing them into one total would be
  // adding euros to dollars. The first one seen names the totals, and a tenant
  // billing in two currencies is a real case this does not yet handle.
  const currency = query.data?.[0]?.currency ?? "EUR";

  if (params.isPending === true) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      {summary.overdueCount > 0 ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-medium text-destructive">
            {t("spaceData.root.overdue", {
              count: summary.overdueCount,
              defaultValue: "{{count}} overdue",
            })}
          </span>
          <span className="text-muted-foreground">
            {" · "}
            {formatMoney(summary.overdueSum, currency)}
          </span>
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {folders.map((folder) => {
          const bucket = summary.byStatus.get(folder.name as InvoiceStatus);
          return (
            <li key={folder.path}>
              <Link
                className={uiStatusCardClassName}
                to={`/s/${encodeURIComponent(spaceKey)}/data?as=folder&path=${encodeURIComponent(folder.path)}`}
              >
                <span className="flex items-center gap-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t(`status.${folder.name}`, { defaultValue: folder.name })}
                  <ChevronRight className="size-3.5" />
                </span>
                {/* No data is "—", never 0: a failed count rendered as zero is
                    a state reported empty when nobody looked. */}
                <span className="font-semibold text-2xl tabular-nums">
                  {query.data ? (bucket?.count ?? 0) : "—"}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {query.data
                    ? formatMoney(bucket?.sum ?? 0, currency)
                    : t("spaceData.root.invoices", {
                        defaultValue: "invoices",
                      })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
