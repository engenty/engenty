import {
  PhaseDisplaySettingsCard,
  SettingsCard,
  SettingsCardSeparator,
  SettingsInfoCard,
  SettingsSection,
  type TaxRate,
} from "@engenty/commercial-editor";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@engenty/ui-core";
import { FolderInput } from "lucide-react";
import type { InvoiceListItem } from "../api.js";
import { recipientDetailsFromSnapshot } from "../lib/invoice-recipient.js";

export interface InvoiceEntityOption {
  display_name: string;
  id: string;
}

/** The camelCase display keys shared with `PhaseDisplaySettingsCard`. They map
 *  1:1 onto `InvoiceUpdateInput`, so no snake_case translation is needed. */
export type InvoiceDisplaySettingKey =
  | "showPhaseIndex"
  | "phaseIndexPattern"
  | "showTaxPerItem"
  | "showPhaseTotals"
  | "defaultTaxRate";

function displaySettingsOf(invoice: InvoiceListItem) {
  return {
    showPhaseIndex: invoice.showPhaseIndex ?? true,
    phaseIndexPattern: invoice.phaseIndexPattern ?? "1.",
    showTaxPerItem: invoice.showTaxPerItem ?? false,
    showPhaseTotals: invoice.showPhaseTotals ?? false,
    defaultTaxRate: invoice.defaultTaxRate ?? 20,
  };
}

export function InvoiceSettingsDetailsSection({
  invoice,
}: {
  invoice: InvoiceListItem;
}) {
  const { t } = useTranslation("invoices");
  const items = [
    { label: t("invoiceTitle"), value: invoice.title?.trim() || "—" },
    { label: t("number"), value: invoice.number },
    { label: t("statusLabel"), value: t(`status.${invoice.status}`) },
  ];
  return (
    <SettingsSection
      description={t("settingsDetailsDescription")}
      title={t("settingsDetailsTitle")}
    >
      <SettingsInfoCard items={items} />
    </SettingsSection>
  );
}

export function InvoiceSettingsRecipientSection({
  invoice,
  entities,
  onOpenClientDialog,
  canChange,
}: {
  invoice: InvoiceListItem;
  entities: InvoiceEntityOption[];
  onOpenClientDialog: () => void;
  canChange: boolean;
}) {
  const { t } = useTranslation("invoices");
  const entityName = invoice.clientId
    ? entities.find((e) => e.id === invoice.clientId)?.display_name
    : undefined;
  const details = recipientDetailsFromSnapshot(
    invoice.recipientSnapshot,
    entityName
  );
  const location = [
    details.address_zip,
    details.address_city,
    details.address_country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <SettingsSection title={t("recipient")}>
      <SettingsCard>
        <div className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0 space-y-0.5 text-sm">
            {details.display_name ? (
              <p className="font-medium">{details.display_name}</p>
            ) : (
              <p className="text-muted-foreground">{t("noClientSelected")}</p>
            )}
            {details.address_street ? (
              <p className="whitespace-pre-line text-muted-foreground">
                {details.address_street}
              </p>
            ) : null}
            {location ? (
              <p className="text-muted-foreground">{location}</p>
            ) : null}
            {details.email ? (
              <p className="text-muted-foreground">{details.email}</p>
            ) : null}
            {details.vat_id ? (
              <p className="text-muted-foreground text-xs">{details.vat_id}</p>
            ) : null}
          </div>
          {canChange ? (
            <Button
              className="shrink-0"
              onClick={onOpenClientDialog}
              size="sm"
              variant="outline"
            >
              <FolderInput className="mr-1.5 h-3.5 w-3.5" />
              {t("changeClient")}
            </Button>
          ) : null}
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}

export function InvoiceSettingsMetadataSection({
  invoice,
  onChange,
}: {
  invoice: InvoiceListItem;
  onChange: (patch: Partial<InvoiceListItem>) => void;
}) {
  const { t } = useTranslation("invoices");
  return (
    <SettingsSection
      description={t("settingsMetadataDescription")}
      title={t("settingsMetadataTitle")}
    >
      <SettingsCard>
        <Row label={t("yourReference")}>
          <Input
            className="w-full"
            onChange={(e) => onChange({ reference: e.target.value })}
            placeholder={t("referencePlaceholder")}
            value={invoice.reference ?? ""}
          />
        </Row>
        <SettingsCardSeparator />
        <Row label={t("invoiceDate")}>
          <DatePicker
            className="w-full"
            onChange={(next) => onChange({ date: next ?? invoice.date })}
            value={invoice.date ?? null}
          />
        </Row>
        <SettingsCardSeparator />
        <Row label={t("dueDate")}>
          <DatePicker
            className="w-full"
            onChange={(next) => onChange({ dueDate: next ?? invoice.dueDate })}
            value={invoice.dueDate ?? null}
          />
        </Row>
      </SettingsCard>
    </SettingsSection>
  );
}

export function InvoiceSettingsTaxSection({
  invoice,
  onDisplaySettingChange,
  taxRates,
}: {
  invoice: InvoiceListItem;
  onDisplaySettingChange: (
    key: InvoiceDisplaySettingKey,
    value: boolean | string | number
  ) => void;
  taxRates: TaxRate[];
}) {
  const { t } = useTranslation("invoices");
  return (
    <SettingsSection
      description={t("settingsTaxDescription")}
      title={t("settingsTaxTitle")}
    >
      <SettingsCard>
        <PhaseDisplaySettingsCard
          contentScope="taxOnly"
          displaySettings={displaySettingsOf(invoice)}
          documentType="invoice"
          onDisplaySettingChange={onDisplaySettingChange}
          showPhaseSettings={false}
          showTaxSettings
          taxRates={taxRates}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export function InvoiceSettingsPhasesSection({
  invoice,
  onChange,
  onDisplaySettingChange,
}: {
  invoice: InvoiceListItem;
  onChange: (patch: Partial<InvoiceListItem>) => void;
  onDisplaySettingChange: (
    key: InvoiceDisplaySettingKey,
    value: boolean | string | number
  ) => void;
}) {
  const { t } = useTranslation("invoices");
  return (
    <SettingsSection
      description={t("settingsPhasesDescription")}
      title={t("settingsPhasesTitle")}
    >
      <SettingsCard>
        <div className="flex items-center justify-between p-4">
          <div className="min-w-0 pr-4">
            <p className="font-semibold text-sm">{t("enablePhases")}</p>
            <p className="text-muted-foreground text-sm">
              {t("enablePhasesDescription")}
            </p>
          </div>
          <Switch
            checked={invoice.phasesEnabled ?? false}
            onCheckedChange={(checked) => onChange({ phasesEnabled: checked })}
          />
        </div>
        <SettingsCardSeparator />
        <PhaseDisplaySettingsCard
          contentScope="phaseOnly"
          displaySettings={displaySettingsOf(invoice)}
          documentType="invoice"
          onDisplaySettingChange={onDisplaySettingChange}
          showPhaseSettings
          showTaxSettings={false}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export function InvoiceSettingsDangerSection({
  onDelete,
}: {
  onDelete: () => void;
}) {
  const { t } = useTranslation("invoices");
  return (
    <SettingsSection title={t("dangerZoneTitle")}>
      <section className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
        <p className="font-medium text-destructive text-sm">
          {t("deleteInvoiceTitle")}
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          {t("deleteInvoiceHint")}
        </p>
        <Button className="mt-3" onClick={onDelete} variant="destructive">
          {t("deleteInvoiceTitle")}
        </Button>
      </section>
    </SettingsSection>
  );
}

export function ChangeClientDialog({
  open,
  onOpenChange,
  selectedClientId,
  onSelectedClientIdChange,
  entities,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedClientId: string;
  onSelectedClientIdChange: (id: string) => void;
  entities: InvoiceEntityOption[];
  onSave: () => void;
}) {
  const { t } = useTranslation("invoices");
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changeClient")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="font-medium text-sm">{t("client")}</p>
            <Select
              onValueChange={onSelectedClientIdChange}
              value={selectedClientId}
            >
              <SelectTrigger>
                <SelectValue>
                  {selectedClientId === "__none__"
                    ? t("noClient")
                    : (entities.find((e) => e.id === selectedClientId)
                        ?.display_name ?? selectedClientId)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("noClient")}</SelectItem>
                {entities.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id}>
                    {entity.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button onClick={onSave} size="sm">
              {t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="shrink-0 text-muted-foreground text-sm">{label}</span>
      <div className="w-full min-w-0 sm:max-w-xs">{children}</div>
    </div>
  );
}
