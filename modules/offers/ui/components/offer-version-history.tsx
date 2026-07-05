import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button, Card, CardContent } from "@engenty/ui-core";
import { FileText, History } from "lucide-react";
import type { OfferListItem } from "../api.js";
import { formatDate } from "../lib/offer-format.js";
import { viewOfferPdf } from "../lib/offer-pdf.js";

interface OfferVersionHistoryProps {
  currentId: string;
  onOpenVersion: (id: string) => void;
  versions: OfferListItem[];
}

export function OfferVersionHistory({
  currentId,
  onOpenVersion,
  versions,
}: OfferVersionHistoryProps) {
  const { t } = useTranslation("offers");
  if (versions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <h2 className="flex items-center gap-2 font-semibold text-lg">
          <History className="h-4 w-4" />
          {t("versionHistory")}
        </h2>
        <ul className="divide-y">
          {versions.map((version) => {
            const isCurrent = version.id === currentId;
            return (
              <li
                className="flex items-center justify-between gap-3 py-3"
                key={version.id}
              >
                <button
                  className="flex items-center gap-2 text-left text-sm hover:underline disabled:no-underline"
                  disabled={isCurrent}
                  onClick={() => onOpenVersion(version.id)}
                  type="button"
                >
                  <span className="font-medium">
                    {t("versionLabel", { number: version.version_number })}
                  </span>
                  {isCurrent ? (
                    <Badge variant="secondary">{t("versionCurrent")}</Badge>
                  ) : null}
                </button>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-xs">
                    {formatDate(version.created_at)}
                  </span>
                  <Button
                    onClick={() => viewOfferPdf(version.id)}
                    size="sm"
                    variant="ghost"
                  >
                    <FileText className="mr-1 h-3.5 w-3.5" />
                    PDF
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
