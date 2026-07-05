import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card, CardContent } from "@engenty/ui-core";
import { Send } from "lucide-react";
import { formatDate } from "../lib/offer-format.js";

interface OfferSendCardProps {
  busy?: boolean;
  onMarkSent: () => void;
  sentAt: string | null;
}

export function OfferSendCard({
  busy,
  onMarkSent,
  sentAt,
}: OfferSendCardProps) {
  const { t } = useTranslation("offers");
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <h2 className="font-semibold text-lg">{t("sendOffer")}</h2>
        {sentAt ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Send className="h-4 w-4 text-primary" />
            {t("sentOn", { date: formatDate(sentAt) })}
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {t("sendOfferDescription")}
            </p>
            <Button className="w-full" disabled={busy} onClick={onMarkSent}>
              <Send className="mr-1.5 h-4 w-4" />
              {t("markAsSent")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
