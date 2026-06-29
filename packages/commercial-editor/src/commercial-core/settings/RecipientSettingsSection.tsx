import { useTranslation } from "@engenty/i18n/ui";
import { SettingsSection } from "../shared/settings";
import { RecipientSettingsCard } from "./RecipientSettingsCard";

export type DocumentType = "offer" | "invoice";

interface ClientDetails {
  address_city?: string | null;
  address_country?: string | null;
  address_street?: string | null;
  address_zip?: string | null;
  company_name?: string;
  contact_name?: string | null;
  display_name?: string;
  email?: string | null;
  vat_id?: string | null;
}

interface RecipientSettingsSectionProps {
  clientDetails: ClientDetails | null;
  clientId?: string;
  customInfo: string;
  documentType: DocumentType;
  onChangeClient?: () => void;
  onCustomInfoBlur?: () => void;
  onCustomInfoChange: (value: string) => void;
  onToggleContactEmail: () => void;
  onToggleContactName: () => void;
  showContactEmail: boolean;
  showContactName: boolean;
}

/**
 * Shared Recipient settings block for Offer and Invoice sidebar settings.
 * Renders section title, description, and RecipientSettingsCard with show/hide toggles for contact name and email.
 */
export const RecipientSettingsSection = ({
  documentType,
  clientDetails,
  clientId,
  showContactName,
  showContactEmail,
  customInfo,
  onToggleContactName,
  onToggleContactEmail,
  onCustomInfoChange,
  onCustomInfoBlur,
  onChangeClient,
}: RecipientSettingsSectionProps) => {
  const { t } = useTranslation("offers");
  const pfx = documentType === "invoice" ? "invoices" : "offers";

  if (!clientDetails) {
    return null;
  }

  return (
    <SettingsSection
      description={t(`${pfx}.settings.recipientDescription`)}
      title={t(`${pfx}.recipient`)}
    >
      <RecipientSettingsCard
        clientDetails={clientDetails}
        clientId={clientId}
        customInfo={customInfo}
        documentType={documentType}
        onChangeClient={onChangeClient}
        onCustomInfoBlur={onCustomInfoBlur}
        onCustomInfoChange={onCustomInfoChange}
        onToggleContactEmail={onToggleContactEmail}
        onToggleContactName={onToggleContactName}
        showContactEmail={showContactEmail}
        showContactName={showContactName}
      />
    </SettingsSection>
  );
};
