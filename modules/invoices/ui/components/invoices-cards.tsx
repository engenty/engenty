import { useTranslation } from "@engenty/i18n/ui";
import { adminListCardsGridClassName, Button } from "@engenty/ui-core";
import type { InvoiceListItem } from "../api.js";

type TableSize = "compact" | "normal";

interface InvoicesCardsProps {
  formatCurrency: (n: number) => string;
  invoices: InvoiceListItem[];
  onCardClick: (invoice: InvoiceListItem) => void;
  onDownloadPdf: (invoice: InvoiceListItem) => void;
  onEdit: (invoice: InvoiceListItem) => void;
  tableSize: TableSize;
}

export function InvoicesCards({
  invoices,
  tableSize,
  onCardClick,
  onDownloadPdf,
  onEdit,
  formatCurrency,
}: InvoicesCardsProps) {
  const { t } = useTranslation("invoices");

  return (
    <div className={adminListCardsGridClassName(tableSize)}>
      {invoices.map((invoice) => (
        <div
          className={`rounded-lg border bg-card text-left transition-colors hover:bg-accent/30 ${
            tableSize === "compact" ? "p-3" : "p-4"
          }`}
          key={invoice.id}
        >
          <div
            className="cursor-pointer"
            onClick={() => onCardClick(invoice)}
            onKeyDown={(e) => e.key === "Enter" && onCardClick(invoice)}
            role="button"
            tabIndex={0}
          >
            <p className="font-medium">{invoice.number}</p>
            <p
              className={`text-muted-foreground text-sm ${tableSize === "compact" ? "mt-1" : "mt-2"}`}
            >
              {invoice.content}
            </p>
            {invoice.recipientSnapshot && (
              <p
                className={`text-muted-foreground text-sm ${tableSize === "compact" ? "mt-0.5" : "mt-1"}`}
              >
                {t("recipient")}: {invoice.recipientSnapshot.displayName}
              </p>
            )}
            <p
              className={`font-medium text-sm ${tableSize === "compact" ? "mt-0.5" : "mt-2"}`}
            >
              {formatCurrency(invoice.sumBrutto)}
            </p>
            <p
              className={`text-muted-foreground text-xs ${tableSize === "compact" ? "mt-0.5" : "mt-1"}`}
            >
              {t("date")}: {invoice.date} · {t("due")}: {invoice.dueDate}
            </p>
          </div>
          <div
            className={`flex gap-2 ${tableSize === "compact" ? "mt-2" : "mt-3"}`}
          >
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onDownloadPdf(invoice);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("downloadPdf")}
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(invoice);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("edit", { context: "invoice" })}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
