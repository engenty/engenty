import type { OfferBillingPlan, OfferListItem } from "../api.js";
import { OfferBillingPlanCard } from "./offer-billing-plan.js";
import { OfferContractStatus } from "./offer-contract-status.js";
import { OfferLinkedProject } from "./offer-linked-project.js";
import { OfferPdfButtons } from "./offer-pdf-buttons.js";
import { OfferSummaryCard } from "./offer-summary-card.js";
import { OfferVersionHistory } from "./offer-version-history.js";

interface OfferAcceptedStateProps {
  blockCount: number;
  busy?: boolean;
  canCreateProject: boolean;
  companyName: string;
  contactName?: string | null;
  gross: number;
  net: number;
  offer: OfferListItem;
  onCreateProject: () => void;
  onMarkSigned: () => void;
  onOpenProject: () => void;
  onOpenVersion: (id: string) => void;
  onSaveBillingPlan: (plan: OfferBillingPlan) => void;
  onSaveContractNotes: (value: string) => void;
  onUploadContractFile: (fileName: string) => void;
  positionCount: number;
  versions: OfferListItem[];
}

export function OfferAcceptedState(props: OfferAcceptedStateProps) {
  return (
    <section className="mx-auto w-full max-w-5xl space-y-4 p-page">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <OfferLinkedProject
            busy={props.busy}
            canCreate={props.canCreateProject}
            onCreateProject={props.onCreateProject}
            onOpenProject={props.onOpenProject}
            projectId={props.offer.project_id}
          />
          <OfferSummaryCard
            blockCount={props.blockCount}
            companyName={props.companyName}
            contactName={props.contactName}
            gross={props.gross}
            headerActions={
              <OfferPdfButtons
                fileName={`${props.offer.offer_number}.pdf`}
                offerId={props.offer.id}
                variant="inline"
              />
            }
            net={props.net}
            offer={props.offer}
            positionCount={props.positionCount}
          />
        </div>

        <div className="space-y-4">
          <OfferContractStatus
            busy={props.busy}
            fileName={props.offer.contract_file_path}
            notes={props.offer.contract_notes}
            onMarkSigned={props.onMarkSigned}
            onSaveNotes={props.onSaveContractNotes}
            onUploadFile={props.onUploadContractFile}
            signedAt={props.offer.contract_signed_at}
          />
          <OfferBillingPlanCard
            busy={props.busy}
            currency={props.offer.currency || "EUR"}
            gross={props.gross}
            onSave={props.onSaveBillingPlan}
            value={props.offer.billing_plan}
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
