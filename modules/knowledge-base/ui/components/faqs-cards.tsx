import { useTranslation } from "@engenty/i18n/ui";
import { adminListCardsGridClassName, Badge, cn } from "@engenty/ui-core";
import type { Faq } from "../../src/schema/types.js";

type TableSize = "compact" | "normal";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

interface FaqsCardsProps {
  faqs: Faq[];
  onCardClick: (faq: Faq) => void;
  tableSize: TableSize;
}

export function FaqsCards({ faqs, tableSize, onCardClick }: FaqsCardsProps) {
  const { t } = useTranslation("kb");

  return (
    <div className={adminListCardsGridClassName(tableSize)}>
      {faqs.map((faq) => (
        <button
          className={cn(
            "ui-card-raised text-left",
            tableSize === "compact" ? "p-3" : "p-4"
          )}
          key={faq.id}
          onClick={() => onCardClick(faq)}
          type="button"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">{faq.question}</p>
            <Badge variant="outline">{faq.status}</Badge>
          </div>
          <p
            className={`text-muted-foreground text-sm ${tableSize === "compact" ? "mt-1" : "mt-2"}`}
          >
            {t("columns.updated_at")}: {formatDate(faq.updated_at)}
          </p>
        </button>
      ))}
    </div>
  );
}
