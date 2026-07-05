import { useTranslation } from "@engenty/i18n/ui";
import { Card, CardContent } from "@engenty/ui-core";
import type { OfferListItem } from "../api.js";
import { OfferApprovalBanner } from "./offer-approval-banner.js";
import { OfferNotesCard } from "./offer-notes-card.js";
import { OfferPdfButtons } from "./offer-pdf-buttons.js";
import { OfferSendCard } from "./offer-send-card.js";
import { OfferSummaryCard } from "./offer-summary-card.js";
import { OfferVersionHistory } from "./offer-version-history.js";

interface OfferReadyStateProps {
  blockCount: number;
  busy?: boolean;
  companyName: string;
  contactName?: string | null;
  gross: number;
  net: number;
  offer: OfferListItem;
  onCreateVersion: () => void;
  onMarkAccepted: () => void;
  onMarkSent: () => void;
  onOpenVersion: (id: string) => void;
  onReopenDraft: () => void;
  onSaveInternalNotes: (value: string) => void;
  positionCount: number;
  versions: OfferListItem[];
}

export function OfferReadyState(props: OfferReadyStateProps) {
  const { t } = useTranslation("offers");
  return (
    <section className="mx-auto w-full max-w-5xl space-y-4 p-page">
      <OfferApprovalBanner
        approvedAt={props.offer.approved_at}
        approvedByName={props.offer.approved_by_name}
        busy={props.busy}
        onCreateVersion={props.onCreateVersion}
        onMarkAccepted={props.onMarkAccepted}
        onReopenDraft={props.onReopenDraft}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OfferSummaryCard
          blockCount={props.blockCount}
          companyName={props.companyName}
          contactName={props.contactName}
          gross={props.gross}
          net={props.net}
          offer={props.offer}
          positionCount={props.positionCount}
        />

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <h2 className="font-semibold text-lg">{t("pdfDocument")}</h2>
              <OfferPdfButtons
                fileName={`${props.offer.offer_number}.pdf`}
                offerId={props.offer.id}
              />
            </CardContent>
          </Card>

          <OfferSendCard
            busy={props.busy}
            onMarkSent={props.onMarkSent}
            sentAt={props.offer.sent_at}
          />

          <OfferNotesCard
            onSave={props.onSaveInternalNotes}
            placeholderKey="internalNotesPlaceholder"
            titleKey="internalNotes"
            value={props.offer.internal_notes}
          />

          <OfferVersionHistory
            currentId={props.offer.id}
            onOpenVersion={props.onOpenVersion}
            versions={props.versions}
          />
        </div>
      </div>
    </section>
  );
}
