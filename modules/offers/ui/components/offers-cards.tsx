import { useTranslation } from "@engenty/i18n/ui";
import { adminListCardsGridClassName } from "@engenty/ui-core";
import type { OfferListItem } from "../api.js";
import { OfferStatusBadge } from "./offer-status-badge.js";

type TableSize = "compact" | "normal";

interface OffersCardsProps {
  offers: OfferListItem[];
  onCardClick: (offer: OfferListItem) => void;
  tableSize: TableSize;
}

export function OffersCards({
  offers,
  tableSize,
  onCardClick,
}: OffersCardsProps) {
  const { t } = useTranslation("offers");

  return (
    <div className={adminListCardsGridClassName(tableSize)}>
      {offers.map((offer) => (
        <button
          className={`rounded-lg border bg-card text-left transition-colors hover:bg-accent/30 ${
            tableSize === "compact" ? "p-3" : "p-4"
          }`}
          key={offer.id}
          onClick={() => onCardClick(offer)}
          type="button"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">{offer.title}</p>
            <OfferStatusBadge status={offer.status} />
          </div>
          <p
            className={`text-muted-foreground text-sm ${tableSize === "compact" ? "mt-1" : "mt-2"}`}
          >
            {offer.offer_number}
          </p>
          <p
            className={`text-muted-foreground text-sm ${tableSize === "compact" ? "mt-0.5" : "mt-1"}`}
          >
            {t("offerDate")}: {offer.offer_date ?? "-"}
          </p>
          <p
            className={`text-muted-foreground text-sm ${tableSize === "compact" ? "mt-0.5" : "mt-1"}`}
          >
            {t("validUntil")}: {offer.valid_until ?? "-"}
          </p>
        </button>
      ))}
    </div>
  );
}
