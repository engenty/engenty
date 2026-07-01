import { useTranslation } from "@engenty/i18n/ui";
import { adminListCardsGridClassName, Badge } from "@engenty/ui-core";
import type { ContactListItem } from "../api.js";

type TableSize = "compact" | "normal";

interface ContactsCardsProps {
  entities: ContactListItem[];
  onCardClick: (entity: ContactListItem) => void;
  tableSize: TableSize;
}

export function ContactsCards({
  entities,
  tableSize,
  onCardClick,
}: ContactsCardsProps) {
  const { t } = useTranslation("contacts");

  return (
    <div className={adminListCardsGridClassName(tableSize)}>
      {entities.map((entity) => (
        <button
          className={`rounded-lg border bg-card text-left transition-colors hover:bg-accent/30 ${
            tableSize === "compact" ? "p-3" : "p-4"
          }`}
          key={entity.id}
          onClick={() => onCardClick(entity)}
          type="button"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium">
              {entity.type === "organisation"
                ? entity.legal_name || entity.display_name
                : entity.display_name}
            </p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">
                {entity.type === "organisation"
                  ? t("organisation")
                  : t("person")}
              </Badge>
              {(entity.roles ?? []).map((r) => (
                <Badge key={r} variant="secondary">
                  {t(`role.${r}`)}
                </Badge>
              ))}
            </div>
          </div>
          <p
            className={`text-muted-foreground text-sm ${tableSize === "compact" ? "mt-1" : "mt-2"}`}
          >
            {entity.email || "-"}
          </p>
          <p
            className={`text-muted-foreground text-sm ${tableSize === "compact" ? "mt-0.5" : "mt-1"}`}
          >
            {entity.contact_name || "-"}
          </p>
          <p
            className={`text-muted-foreground text-sm ${
              tableSize === "compact" ? "mt-0.5" : "mt-1"
            }`}
          >
            {[entity.address_zip, entity.address_city, entity.address_country]
              .filter(Boolean)
              .join(", ") || "-"}
          </p>
        </button>
      ))}
    </div>
  );
}
