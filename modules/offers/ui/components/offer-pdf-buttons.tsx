import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Download, Eye } from "lucide-react";
import { useState } from "react";
import { saveOfferPdf, viewOfferPdf } from "../lib/offer-pdf.js";

interface OfferPdfButtonsProps {
  fileName: string;
  offerId: string;
  /** "inline" renders compact ghost buttons for a card header. */
  variant?: "inline" | "stacked";
}

export function OfferPdfButtons({
  fileName,
  offerId,
  variant = "stacked",
}: OfferPdfButtonsProps) {
  const { t } = useTranslation("offers");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-2">
        <Button
          disabled={busy}
          onClick={() => run(() => viewOfferPdf(offerId))}
          size="sm"
          variant="ghost"
        >
          <Eye className="mr-1.5 h-4 w-4" />
          {t("viewPdf")}
        </Button>
        <Button
          disabled={busy}
          onClick={() => run(() => saveOfferPdf(offerId, fileName))}
          size="sm"
          variant="ghost"
        >
          <Download className="mr-1.5 h-4 w-4" />
          {t("downloadPdf")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        className="justify-start"
        disabled={busy}
        onClick={() => run(() => viewOfferPdf(offerId))}
        variant="outline"
      >
        <Eye className="mr-2 h-4 w-4" />
        {t("viewPdf")}
      </Button>
      <Button
        className="justify-start"
        disabled={busy}
        onClick={() => run(() => saveOfferPdf(offerId, fileName))}
        variant="outline"
      >
        <Download className="mr-2 h-4 w-4" />
        {t("downloadPdf")}
      </Button>
    </div>
  );
}
