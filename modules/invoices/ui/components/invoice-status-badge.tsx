import { useTranslation } from "@engenty/i18n/ui";
import { Badge, cn } from "@engenty/ui-core";
import type { InvoiceStatus } from "../api.js";

/**
 * Semantic status colors, shared across the invoices UI. draft = amber (in
 * progress), issued/sent = blue (finalized, awaiting payment), paid = emerald
 * (settled), cancelled = zinc (voided). The core Badge has no semantic
 * variants, so we tint via className on the `outline` variant.
 */
const INVOICE_STATUS_BADGE_CLASS: Record<InvoiceStatus, string> = {
  draft:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300",
  issued:
    "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-950/40 dark:text-blue-300",
  sent: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-950/40 dark:text-blue-300",
  paid: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300",
  cancelled:
    "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-500/40 dark:bg-zinc-900/40 dark:text-zinc-300",
};

export function InvoiceStatusBadge({
  className,
  status,
}: {
  className?: string;
  status: InvoiceStatus;
}) {
  const { t } = useTranslation("invoices");
  return (
    <Badge
      className={cn(INVOICE_STATUS_BADGE_CLASS[status], className)}
      variant="outline"
    >
      {t(`status.${status}`)}
    </Badge>
  );
}
