import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
} from "@engenty/ui-core";
import { AnimatedDownloadIcon } from "@engenty/ui-icons";
import { Eye } from "lucide-react";

export type DocumentType = "offer" | "invoice";

export interface DocumentMetaItem {
  label: string;
  value: string | React.ReactNode;
}

export interface TotalsData {
  subtotal: number;
  taxBreakdown: Array<{ rate: number; amount: number }>;
  total: number;
}

interface DocumentSummaryCardProps {
  blockCount?: number;
  currency: string;
  documentTitle: string;
  documentType?: DocumentType;
  finalNotes?: string | null;
  introduction?: string | null;
  lineItemCount?: number;
  metaItems: DocumentMetaItem[];
  onDownloadPdf?: () => void;
  onViewPdf?: () => void;
  sections?: Array<{
    title: string;
    items: Array<{ type: string; title: string }>;
    subtotal: number;
    isPhase?: boolean;
    phasePrefix?: string;
  }>;
  showPdfButtons?: boolean;
  /** Document title (e.g., "Invoice Summary" or "Offer Summary") */
  title: string;
  totals: TotalsData;
}

const stripHtml = (html: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
};

const truncate = (text: string, maxLength: number) => {
  if (!text) {
    return "";
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

export const DocumentSummaryCard = ({
  documentType = "offer",
  title,
  documentTitle,
  metaItems,
  currency,
  totals,
  blockCount,
  lineItemCount,
  introduction,
  finalNotes,
  sections,
  showPdfButtons,
  onViewPdf,
  onDownloadPdf,
}: DocumentSummaryCardProps) => {
  const { t, i18n } = useTranslation("offers");
  const ns = `${documentType}s`;

  const moneyFormatter = new Intl.NumberFormat(
    i18n.resolvedLanguage || i18n.language || "de-DE",
    {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <CardTitle className="text-base">{title}</CardTitle>
          {showPdfButtons && (
            <div className="flex gap-1.5">
              {onViewPdf && (
                <Button
                  className="h-7 px-2 text-xs"
                  onClick={onViewPdf}
                  size="sm"
                  variant="outline"
                >
                  <Eye className="mr-1 size-3" />
                  {t(`${ns}.viewPdf`)}
                </Button>
              )}
              {onDownloadPdf && (
                <Button
                  className="h-7 px-2 text-xs"
                  onClick={onDownloadPdf}
                  size="sm"
                  variant="outline"
                >
                  <AnimatedDownloadIcon className="mr-1" size="xs" />
                  {t(`${ns}.downloadPdf`)}
                </Button>
              )}
            </div>
          )}
        </div>
        <Separator className="mt-3" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {metaItems.map((item, idx) => (
            <div className="flex justify-between text-sm" key={idx}>
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium">{item.value}</span>
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="font-semibold text-sm">{documentTitle}</p>

          {introduction && (
            <p className="truncate text-muted-foreground text-xs italic">
              {truncate(stripHtml(introduction), 80)}
            </p>
          )}

          {sections?.map((section, idx) => (
            <div className="space-y-1" key={idx}>
              <p
                className={`text-sm ${section.isPhase ? "font-bold" : "font-semibold"}`}
              >
                {section.phasePrefix
                  ? `${section.phasePrefix} ${section.title}`
                  : section.title}
              </p>

              {section.items.map((item, itemIdx) => (
                <p
                  className={`text-muted-foreground text-xs ${item.type === "subheading" ? "pl-2 font-medium" : "pl-4"}`}
                  key={itemIdx}
                >
                  {truncate(item.title, 50)}
                </p>
              ))}

              {section.subtotal > 0 && (
                <div className="border-t border-dashed pt-1 pl-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {t(`${ns}.totals.subtotal`)}
                    </span>
                    <span className="font-medium tabular-nums">
                      {moneyFormatter.format(section.subtotal)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}

          {finalNotes && (
            <p className="truncate border-t pt-2 text-muted-foreground text-xs italic">
              {truncate(stripHtml(finalNotes), 80)}
            </p>
          )}

          {(blockCount !== undefined || lineItemCount !== undefined) && (
            <div className="flex justify-between pt-2 text-muted-foreground text-xs">
              {blockCount !== undefined && (
                <span>
                  {blockCount} {t(`${ns}.blocks`)}
                </span>
              )}
              {lineItemCount !== undefined && (
                <span>
                  {lineItemCount} {t(`${ns}.lineItems`)}
                </span>
              )}
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t(`${ns}.totals.netTotal`)}
            </span>
            <span>{moneyFormatter.format(totals.subtotal)}</span>
          </div>
          {totals.taxBreakdown.map((tax) => (
            <div className="flex justify-between text-sm" key={tax.rate}>
              <span className="text-muted-foreground">
                {t(`${ns}.totals.tax`)} {tax.rate}%
              </span>
              <span>{moneyFormatter.format(tax.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2">
            <span className="font-medium">{t(`${ns}.totals.grossTotal`)}</span>
            <span className="font-bold text-lg">
              {moneyFormatter.format(totals.total)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
