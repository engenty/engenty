import { stripHtmlTags } from "@engenty/commercial-editor";
import { useTranslation } from "@engenty/i18n/ui";
import { Card, CardContent } from "@engenty/ui-core";
import type { ReactNode } from "react";
import type { OfferListItem } from "../api.js";
import { formatCurrency, formatDate } from "../lib/offer-format.js";

interface OfferSummaryCardProps {
  blockCount: number;
  companyName: string;
  contactName?: string | null;
  gross: number;
  headerActions?: ReactNode;
  net: number;
  offer: OfferListItem;
  positionCount: number;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function OfferSummaryCard({
  blockCount,
  companyName,
  contactName,
  gross,
  headerActions,
  net,
  offer,
  positionCount,
}: OfferSummaryCardProps) {
  const { t } = useTranslation("offers");
  const currency = offer.currency || "EUR";
  const intro = stripHtmlTags(offer.introduction ?? "").trim();
  const finalNotes = stripHtmlTags(offer.final_notes ?? "").trim();

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-lg">{t("offerOverview")}</h2>
          {headerActions}
        </div>

        <div className="space-y-2 border-t pt-4">
          <Row label={t("summaryTitle")} value={offer.title || "—"} />
          <Row label={t("summaryCompany")} value={companyName || "—"} />
          <Row label={t("offerNumber")} value={offer.offer_number} />
          <Row label={t("summaryContact")} value={contactName || "—"} />
          <Row label={t("summaryDate")} value={formatDate(offer.offer_date)} />
          <Row label={t("validUntil")} value={formatDate(offer.valid_until)} />
          {offer.approved_at ? (
            <Row
              label={t("summaryApproved")}
              value={formatDate(offer.approved_at)}
            />
          ) : null}
        </div>

        {intro || finalNotes || offer.title ? (
          <div className="space-y-2 border-t pt-4">
            <p className="font-medium text-sm">{offer.title}</p>
            {intro ? (
              <p className="line-clamp-2 text-muted-foreground text-sm italic">
                {intro}
              </p>
            ) : null}
            {finalNotes ? (
              <p className="line-clamp-1 text-muted-foreground text-sm italic">
                {finalNotes}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t pt-4 text-muted-foreground text-sm">
          <span>{t("blocksCount", { count: blockCount })}</span>
          <span>{t("positionsCount", { count: positionCount })}</span>
        </div>

        <div className="space-y-1 border-t pt-4">
          <Row label={t("sumNet")} value={formatCurrency(net, currency)} />
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-semibold">{t("sumGross")}</span>
            <span className="font-semibold text-lg">
              {formatCurrency(gross, currency)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
