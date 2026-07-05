import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card } from "@engenty/ui-core";
import { CheckCircle2, Plus, RotateCcw } from "lucide-react";
import { formatRelativeTime } from "../lib/offer-format.js";

interface OfferApprovalBannerProps {
  approvedAt: string | null;
  approvedByName: string | null;
  busy?: boolean;
  onCreateVersion: () => void;
  onMarkAccepted: () => void;
  onReopenDraft: () => void;
}

export function OfferApprovalBanner({
  approvedAt,
  approvedByName,
  busy,
  onCreateVersion,
  onMarkAccepted,
  onReopenDraft,
}: OfferApprovalBannerProps) {
  const { t } = useTranslation("offers");
  const relative = formatRelativeTime(approvedAt);
  const subtitle = [
    relative,
    approvedByName ? t("approvalBy", { name: approvedByName }) : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Card className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-6 w-6 text-primary" />
        <div>
          <p className="font-semibold">{t("approvalApproved")}</p>
          {subtitle ? (
            <p className="text-muted-foreground text-sm">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy}
          onClick={onCreateVersion}
          size="sm"
          variant="outline"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {t("createNewVersion")}
        </Button>
        <Button
          disabled={busy}
          onClick={onReopenDraft}
          size="sm"
          variant="outline"
        >
          <RotateCcw className="mr-1.5 h-4 w-4" />
          {t("reopenDraft")}
        </Button>
        <Button disabled={busy} onClick={onMarkAccepted} size="sm">
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
          {t("markAccepted")}
        </Button>
      </div>
    </Card>
  );
}
