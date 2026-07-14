import type { TaxRate } from "@engenty/commercial-editor";
import { useTranslation } from "@engenty/i18n/ui";
import { useEffect, useState } from "react";
import type { OfferListItem } from "../api.js";
import { mapDisplaySettingPatch } from "../lib/offer-settings-mappers.js";
import { getContactsPluginApi } from "../plugins.js";
import {
  useOfferTemplatesQuery,
  useSetDefaultOfferTemplateMutation,
} from "../queries.js";
import {
  ChangeClientDialog,
  type OfferEntityListItem,
  OfferSettingsBillingSection,
  OfferSettingsDangerSection,
  OfferSettingsDetailsSection,
  OfferSettingsPhasesSection,
  OfferSettingsRecipientSection,
  OfferSettingsTaxSection,
  OfferSettingsTemplateSection,
} from "./offer-settings-sections.js";

export interface ClientSnapshot {
  recipient_address: string;
  recipient_email: string;
  recipient_name: string;
}

interface OfferSettingsPanelProps {
  entities: OfferEntityListItem[];
  entitiesAvailable: boolean;
  offer: OfferListItem;
  onChange: (patch: Partial<OfferListItem>) => void;
  onClientSelect?: (clientId: string) => Promise<ClientSnapshot | null>;
  onDelete: () => void;
  settingsTaxRates: TaxRate[];
}

/**
 * Offer settings sections for the draft page's doc sidebar
 * (`DocSidebarLayout` renders it inline when wide, as an overlay sheet when
 * narrow). Mounts only while the sidebar is visible.
 */
export function OfferSettingsPanel({
  offer,
  entities,
  entitiesAvailable,
  onClientSelect,
  onChange,
  onDelete,
  settingsTaxRates,
}: OfferSettingsPanelProps) {
  const { t } = useTranslation("offers");
  const contactsPlugin = getContactsPluginApi();
  const ContactChooser = contactsPlugin?.ContactChooser ?? null;
  const [changeClientOpen, setChangeClientOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("__none__");

  const { data: templates = [], isLoading: loadingTemplates } =
    useOfferTemplatesQuery();
  const setDefaultTemplateMutation = useSetDefaultOfferTemplateMutation();

  useEffect(() => {
    setSelectedClientId(offer.client_id ?? "__none__");
  }, [offer.client_id, changeClientOpen]);

  const handleClientChange = async (value: string) => {
    const clientId = value === "__none__" ? null : value;
    if (clientId && onClientSelect) {
      const snapshot = await onClientSelect(clientId);
      if (snapshot) {
        onChange({
          client_id: clientId,
          recipient_name: snapshot.recipient_name,
          recipient_address: snapshot.recipient_address,
          recipient_email: snapshot.recipient_email,
        });
        return;
      }
    }
    onChange({ client_id: clientId });
  };

  const handleRefreshClientSnapshot = async () => {
    if (!(offer.client_id && onClientSelect)) {
      return;
    }
    const snapshot = await onClientSelect(offer.client_id);
    if (!snapshot) {
      return;
    }
    onChange({
      recipient_name: snapshot.recipient_name,
      recipient_address: snapshot.recipient_address,
      recipient_email: snapshot.recipient_email,
    });
  };

  const handleTemplateChange = async (templateId: string) => {
    onChange({ template_id: templateId });
    try {
      await setDefaultTemplateMutation.mutateAsync(templateId);
    } catch {
      // Keep local selection even if default update fails.
    }
  };

  const handleDisplaySettingChange = (
    key:
      | "showPhaseIndex"
      | "phaseIndexPattern"
      | "showTaxPerItem"
      | "showPhaseTotals"
      | "defaultTaxRate",
    value: boolean | string | number
  ) => {
    onChange(mapDisplaySettingPatch(key, value));
  };

  return (
    <div className="flex flex-col gap-5">
      <OfferSettingsDetailsSection offer={offer} onChange={onChange} t={t} />
      <OfferSettingsRecipientSection
        entities={entities}
        entitiesAvailable={entitiesAvailable}
        offer={offer}
        onChange={onChange}
        onOpenClientDialog={() => setChangeClientOpen(true)}
        onRefreshClientSnapshot={handleRefreshClientSnapshot}
        t={t}
      />
      <OfferSettingsBillingSection offer={offer} onChange={onChange} />
      <OfferSettingsTaxSection
        offer={offer}
        onChange={onChange}
        onDisplaySettingChange={handleDisplaySettingChange}
        taxRates={settingsTaxRates}
      />
      <OfferSettingsTemplateSection
        loadingTemplates={loadingTemplates}
        offer={offer}
        onDisplaySettingChange={handleDisplaySettingChange}
        onTemplateChange={(id) => {
          handleTemplateChange(id);
        }}
        templates={templates}
      />
      <OfferSettingsPhasesSection
        offer={offer}
        onChange={onChange}
        onDisplaySettingChange={handleDisplaySettingChange}
      />
      <OfferSettingsDangerSection onDelete={onDelete} />

      {entitiesAvailable ? (
        <ChangeClientDialog
          ContactChooser={ContactChooser}
          entities={entities}
          onOpenChange={setChangeClientOpen}
          onSave={() => {
            handleClientChange(selectedClientId);
            setChangeClientOpen(false);
          }}
          onSelectedClientIdChange={setSelectedClientId}
          open={changeClientOpen}
          selectedClientId={selectedClientId}
          t={t}
        />
      ) : null}
    </div>
  );
}
