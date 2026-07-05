// Contributed to the contacts detail page (`contacts.detail` tab surface):
// the contact's offers, linked into the offers module.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@engenty/ui-core";
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import type { OfferStatus } from "../api.js";
import { useOffersListQuery } from "../queries.js";

const STATUS_BADGE_VARIANT: Record<
  OfferStatus,
  "default" | "outline" | "secondary"
> = {
  accepted: "default",
  draft: "outline",
  ready: "secondary",
};

export function ContactOffersTab({ params }: UiTabRenderProps) {
  const { t } = useTranslation("offers");
  const contactId =
    typeof params.contact_id === "string" ? params.contact_id : null;
  const listQuery = useOffersListQuery(
    contactId
      ? { client_id: contactId, sortBy: "created_at", sortOrder: "desc" }
      : {}
  );

  if (!contactId) {
    return null;
  }
  if (listQuery.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  const offers = listQuery.data?.data ?? [];
  if (offers.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t("contactTabEmpty")}</EmptyTitle>
          <EmptyDescription>{t("contactTabEmptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <Button asChild size="sm" variant="outline">
          <Link to="/mdl/offers">
            <Plus className="mr-1.5 size-4" />
            {t("newOffer", { defaultValue: "New offer" })}
          </Link>
        </Button>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {t("contactTabCount", { count: listQuery.data?.total ?? 0 })}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/mdl/offers">{t("contactTabViewAll")}</Link>
        </Button>
      </div>
      <div className="space-y-2">
        {offers.map((offer) => (
          <Card className="p-0" key={offer.id}>
            <Link
              className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent"
              to={`/mdl/offers/${offer.id}${offer.status === "draft" ? "/draft" : ""}`}
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-sm">
                  {offer.title}
                </div>
                <div className="text-muted-foreground text-xs">
                  {offer.offer_number}
                  {offer.offer_date ? ` · ${offer.offer_date}` : ""}
                </div>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[offer.status]}>
                {t(`statusLabels.${offer.status}`)}
              </Badge>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
