import { useTranslation } from "@engenty/i18n/ui";
import { Badge, cn } from "@engenty/ui-core";
import type { OfferStatus } from "../api.js";

/**
 * Semantic status colors, shared across the offers UI (table, sidebar,
 * contact tab, cards). draft = amber (in progress), ready = blue (finalized,
 * awaiting the client), accepted = emerald (won). The core Badge has no
 * semantic variants, so we tint via className on the `outline` variant.
 */
const OFFER_STATUS_BADGE_CLASS: Record<OfferStatus, string> = {
  draft:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300",
  ready:
    "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-950/40 dark:text-blue-300",
  accepted:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300",
};

export function OfferStatusBadge({
  className,
  status,
}: {
  className?: string;
  status: OfferStatus;
}) {
  const { t } = useTranslation("offers");
  return (
    <Badge
      className={cn(OFFER_STATUS_BADGE_CLASS[status], className)}
      variant="outline"
    >
      {t(`statusLabels.${status}`)}
    </Badge>
  );
}
