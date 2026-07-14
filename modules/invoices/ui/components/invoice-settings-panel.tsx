import type { TaxRate } from "@engenty/commercial-editor";
import { useTranslation } from "@engenty/i18n/ui";
import { useEffect, useState } from "react";
import type { InvoiceListItem } from "../api.js";
import {
  ChangeClientDialog,
  type InvoiceDisplaySettingKey,
  type InvoiceEntityOption,
  InvoiceSettingsDangerSection,
  InvoiceSettingsDetailsSection,
  InvoiceSettingsMetadataSection,
  InvoiceSettingsPhasesSection,
  InvoiceSettingsRecipientSection,
  InvoiceSettingsTaxSection,
} from "./invoice-settings-sections.js";

interface InvoiceSettingsPanelProps {
  entities: InvoiceEntityOption[];
  entitiesAvailable: boolean;
  invoice: InvoiceListItem;
  onChange: (patch: Partial<InvoiceListItem>) => void;
  onDelete: () => void;
  settingsTaxRates: TaxRate[];
}

/**
 * Invoice settings sections for the draft page's doc sidebar
 * (`DocSidebarLayout` renders it inline when wide, as an overlay sheet when
 * narrow). Mirrors the offers settings panel, scoped to the fields the
 * invoice update API actually persists. Mounts only while the sidebar is
 * visible.
 */
export function InvoiceSettingsPanel({
  invoice,
  entities,
  entitiesAvailable,
  onChange,
  onDelete,
  settingsTaxRates,
}: InvoiceSettingsPanelProps) {
  const { t } = useTranslation("invoices");
  const [changeClientOpen, setChangeClientOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("__none__");

  useEffect(() => {
    setSelectedClientId(invoice.clientId ?? "__none__");
  }, [invoice.clientId, changeClientOpen]);

  const handleDisplaySettingChange = (
    key: InvoiceDisplaySettingKey,
    value: boolean | string | number
  ) => {
    if (key === "phaseIndexPattern") {
      onChange({ phaseIndexPattern: String(value) });
    } else if (key === "defaultTaxRate") {
      onChange({ defaultTaxRate: Number(value) || 0 });
    } else {
      onChange({ [key]: Boolean(value) } as Partial<InvoiceListItem>);
    }
  };

  const handleClientSave = () => {
    const clientId = selectedClientId === "__none__" ? null : selectedClientId;
    // The backend re-resolves the recipient snapshot from the new clientId.
    onChange({ clientId: clientId ?? undefined });
    setChangeClientOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <InvoiceSettingsDetailsSection invoice={invoice} />
      <InvoiceSettingsRecipientSection
        canChange={entitiesAvailable}
        entities={entities}
        invoice={invoice}
        onOpenClientDialog={() => setChangeClientOpen(true)}
      />
      <InvoiceSettingsMetadataSection invoice={invoice} onChange={onChange} />
      <InvoiceSettingsTaxSection
        invoice={invoice}
        onDisplaySettingChange={handleDisplaySettingChange}
        taxRates={settingsTaxRates}
      />
      <InvoiceSettingsPhasesSection
        invoice={invoice}
        onChange={onChange}
        onDisplaySettingChange={handleDisplaySettingChange}
      />
      <InvoiceSettingsDangerSection onDelete={onDelete} />

      {entitiesAvailable ? (
        <ChangeClientDialog
          entities={entities}
          onOpenChange={setChangeClientOpen}
          onSave={handleClientSave}
          onSelectedClientIdChange={setSelectedClientId}
          open={changeClientOpen}
          selectedClientId={selectedClientId}
        />
      ) : null}
    </div>
  );
}
