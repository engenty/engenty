import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { Check, Download, FileText } from "lucide-react";
import type { ReactNode } from "react";

export interface OfferDraftToolbarProps {
  className?: string;
  /** Inner row max-width / alignment — match `DocSidebarLayout` below. */
  contentClassName?: string;
  downloadingPdf?: boolean;
  /** Trailing slot — typically `DocSidebarToggle`. */
  end?: ReactNode;
  onDownloadPdf: () => void;
  onMarkAsReady: () => void;
  onPreviewPdf: () => void;
  previewLoading?: boolean;
  saving?: boolean;
}

/**
 * Draft-step toolbar under the header: mark-as-ready + PDF actions on the left,
 * document-edge controls (settings toggle) on the right.
 * Save / overflow stay in the shell topbar.
 */
export function OfferDraftToolbar({
  className,
  contentClassName,
  downloadingPdf = false,
  end,
  onDownloadPdf,
  onMarkAsReady,
  onPreviewPdf,
  previewLoading = false,
  saving = false,
}: OfferDraftToolbarProps) {
  const { t } = useTranslation("offers");

  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center border-border border-b bg-card",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full items-center justify-between gap-3 px-page",
          contentClassName
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button disabled={saving} onClick={onMarkAsReady} size="sm">
            <Check className="mr-1.5 h-4 w-4" />
            {t("markAsReady")}
          </Button>
          <Button
            disabled={saving || previewLoading}
            onClick={onPreviewPdf}
            size="sm"
            variant="outline"
          >
            <FileText className="mr-1.5 h-4 w-4" />
            {t("previewPdf")}
          </Button>
          <Button
            disabled={downloadingPdf}
            onClick={onDownloadPdf}
            size="sm"
            variant="outline"
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t("downloadPdf")}
          </Button>
        </div>
        {end ? (
          <div className="flex shrink-0 items-center gap-2">{end}</div>
        ) : null}
      </div>
    </div>
  );
}
