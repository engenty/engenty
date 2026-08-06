import type { TaxRate } from "@engenty/commercial-editor";
import { useTranslation } from "@engenty/i18n/ui";
import type { OfferListItem } from "../api.js";
import { mapDisplaySettingPatch } from "../lib/offer-settings-mappers.js";
import {
  useOfferTemplatesQuery,
  useSetDefaultOfferTemplateMutation,
} from "../queries.js";
import {
  type OfferEntityListItem,
  OfferSettingsBillingSection,
  OfferSettingsDangerSection,
  OfferSettingsDetailsSection,
  OfferSettingsPhasesSection,
  OfferSettingsRecipientSection,
  OfferSettingsTaxSection,
  OfferSettingsTemplateSection,
} from "./offer-settings-sections.js";

interface OfferSettingsPanelProps {
  entities: OfferEntityListItem[];
  entitiesAvailable: boolean;
  offer: OfferListItem;
  onChange: (patch: Partial<OfferListItem>) => void;
  onDelete: () => void;
  /** Opens the page-level change-client dialog (shared with the editor). */
  onOpenClientDialog: () => void;
  onRefreshClientSnapshot: () => Promise<void> | void;
  settingsTaxRates: TaxRate[];
}

/**
 * Offer settings sections for the draft page's doc sidebar
 * (`DocSidebarLayout` renders it inline when wide, as an overlay sheet when
 * narrow). Mounts only while the sidebar is visible.
 *
 * Change-client dialog lives on the edit page so the document recipient
 * block can open it even when this panel is unmounted.
 */
export function OfferSettingsPanel({
  offer,
  entities,
  entitiesAvailable,
  onOpenClientDialog,
  onRefreshClientSnapshot,
  onChange,
  onDelete,
  settingsTaxRates,
}: OfferSettingsPanelProps) {
  const { t } = useTranslation("offers");

  const { data: templates = [], isLoading: loadingTemplates } =
    useOfferTemplatesQuery();
  const setDefaultTemplateMutation = useSetDefaultOfferTemplateMutation();

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
        onOpenClientDialog={onOpenClientDialog}
        onRefreshClientSnapshot={onRefreshClientSnapshot}
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
    </div>
  );
}
