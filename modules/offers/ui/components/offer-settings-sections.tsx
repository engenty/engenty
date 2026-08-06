import {
  PhaseDisplaySettingsCard,
  SettingsCard,
  SettingsCardSeparator,
  SettingsInfoCard,
  SettingsSection,
  type TaxRate,
  TemplateSettingsSection,
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
  Textarea,
} from "@engenty/ui-core";
import type { OfferListItem, OfferTemplate } from "../api.js";
import type { ContactChooserComponent } from "../plugins.js";
import { OfferNumberField } from "./offer-number-field.js";
import { OfferTextField } from "./offer-text-field.js";
import { RecipientSettingsCard } from "./recipient-settings-card.js";

type TFn = (key: string) => string;

export interface OfferEntityListItem {
  address_city: string | null;
  address_country: string | null;
  address_info: string | null;
  address_street: string | null;
  address_zip: string | null;
  contact_name: string;
  display_name: string;
  email: string | null;
  id: string;
  vat_id: string | null;
}

export function OfferSettingsDetailsSection({
  offer,
  onChange,
  t,
}: {
  offer: OfferListItem;
  onChange: (patch: Partial<OfferListItem>) => void;
  t: TFn;
}) {
  const detailsItems = [
    {
      label: t("offerTitle"),
      layout: "stack" as const,
      value: offer.title?.trim() ?? "-",
      action: (
        <OfferTextField
          description={t("editOfferTitleDescription")}
          disabled={offer.status !== "draft"}
          editIconPosition="before"
          onChange={(next) => onChange({ title: next ?? "" })}
          placeholder={t("offerTitlePlaceholder")}
          title={t("editOfferTitle")}
          value={offer.title ?? ""}
        />
      ),
    },
    {
      label: t("offerNumber"),
      value: offer.offer_number,
      action: (
        <OfferNumberField
          disabled={offer.status !== "draft"}
          editIconPosition="before"
          offerId={offer.id}
          onSave={(next) => onChange({ offer_number: next })}
          value={offer.offer_number}
        />
      ),
    },
    { label: t("status"), value: t(`statusLabels.${offer.status}`) },
  ];

  return (
    <SettingsSection
      description={t("settingsDetailsDescription")}
      title={t("settingsDetailsTitle")}
    >
      <SettingsInfoCard items={detailsItems} />
    </SettingsSection>
  );
}

export function OfferSettingsRecipientSection({
  offer,
  entities,
  entitiesAvailable,
  t,
  onChange,
  onOpenClientDialog,
  onRefreshClientSnapshot,
}: {
  offer: OfferListItem;
  entities: OfferEntityListItem[];
  entitiesAvailable: boolean;
  t: TFn;
  onChange: (patch: Partial<OfferListItem>) => void;
  onOpenClientDialog: () => void;
  onRefreshClientSnapshot: () => Promise<void>;
}) {
  const selectedContact = offer.client_id
    ? entities.find((e) => e.id === offer.client_id)
    : null;
  const recipientClientDetails = selectedContact
    ? {
        display_name: selectedContact.display_name,
        address_street: [
          selectedContact.address_street,
          selectedContact.address_info,
        ]
          .filter(Boolean)
          .join("\n"),
        address_zip: selectedContact.address_zip,
        address_city: selectedContact.address_city,
        address_country: selectedContact.address_country,
        contact_name: selectedContact.contact_name,
        email: selectedContact.email,
        vat_id: selectedContact.vat_id,
      }
    : {
        display_name: offer.recipient_name ?? undefined,
        address_street: offer.recipient_address ?? null,
        address_zip: null,
        address_city: null,
        address_country: null,
        contact_name: null,
        email: offer.recipient_email ?? null,
        vat_id: null,
      };

  return (
    <SettingsSection title={t("recipient")}>
      {entitiesAvailable ? (
        <RecipientSettingsCard
          canManageClient
          clientDetails={recipientClientDetails}
          clientId={offer.client_id}
          customInfo={offer.recipient_custom_info ?? ""}
          onChangeClient={onOpenClientDialog}
          onCustomInfoChange={(value) =>
            onChange({ recipient_custom_info: value })
          }
          onRefreshClient={onRefreshClientSnapshot}
          onToggleContactEmail={() =>
            onChange({ show_contact_email: !offer.show_contact_email })
          }
          onToggleContactName={() =>
            onChange({ show_contact_name: !offer.show_contact_name })
          }
          showContactEmail={offer.show_contact_email}
          showContactName={offer.show_contact_name}
        />
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            {t("contactsModuleUnavailable")}
          </p>
          <div className="space-y-1">
            <p className="font-medium text-sm">{t("name")}</p>
            <Input
              onChange={(event) =>
                onChange({ recipient_name: event.target.value })
              }
              value={offer.recipient_name ?? ""}
            />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-sm">{t("email")}</p>
            <Input
              onChange={(event) =>
                onChange({ recipient_email: event.target.value })
              }
              value={offer.recipient_email ?? ""}
            />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-sm">{t("address")}</p>
            <Textarea
              onChange={(event) =>
                onChange({ recipient_address: event.target.value })
              }
              value={offer.recipient_address ?? ""}
            />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-sm">{t("additionalInfo")}</p>
            <Textarea
              onChange={(event) =>
                onChange({ recipient_custom_info: event.target.value })
              }
              value={offer.recipient_custom_info ?? ""}
            />
          </div>
        </>
      )}
    </SettingsSection>
  );
}

export function OfferSettingsTemplateSection({
  offer,
  templates,
  loadingTemplates,
  onTemplateChange,
  onDisplaySettingChange,
}: {
  offer: OfferListItem;
  templates: OfferTemplate[];
  loadingTemplates: boolean;
  onTemplateChange: (templateId: string) => void;
  onDisplaySettingChange: (
    key:
      | "showPhaseIndex"
      | "phaseIndexPattern"
      | "showTaxPerItem"
      | "showPhaseTotals"
      | "defaultTaxRate",
    value: boolean | string | number
  ) => void;
}) {
  const displaySettings = {
    showPhaseIndex: offer.show_phase_index,
    phaseIndexPattern: offer.phase_index_pattern,
    showTaxPerItem: offer.show_tax_per_item,
    showPhaseTotals: offer.show_phase_totals,
    defaultTaxRate: offer.default_tax_rate,
  };

  return (
    <TemplateSettingsSection
      displaySettings={displaySettings}
      documentType="offer"
      includePhaseDisplaySettings={false}
      loading={loadingTemplates}
      onDisplaySettingChange={onDisplaySettingChange}
      onTemplateChange={onTemplateChange}
      sectionDescriptionKey="offers.settings.pdfTemplateSectionDescription"
      sectionTitleKey="offers.settings.pdfTemplateSectionTitle"
      templateId={offer.template_id}
      templates={templates.map((template) => ({
        id: template.id,
        name: template.name,
        is_default: template.is_default,
      }))}
    />
  );
}

export function OfferSettingsTaxSection({
  offer,
  onChange,
  onDisplaySettingChange,
  taxRates,
}: {
  offer: OfferListItem;
  onChange: (patch: Partial<OfferListItem>) => void;
  taxRates: TaxRate[];
  onDisplaySettingChange: (
    key:
      | "showPhaseIndex"
      | "phaseIndexPattern"
      | "showTaxPerItem"
      | "showPhaseTotals"
      | "defaultTaxRate",
    value: boolean | string | number
  ) => void;
}) {
  const { t } = useTranslation("offers");
  const s = (key: string) => t(`offers.settings.${key}`);

  const displaySettings = {
    showPhaseIndex: offer.show_phase_index,
    phaseIndexPattern: offer.phase_index_pattern,
    showTaxPerItem: offer.show_tax_per_item,
    showPhaseTotals: offer.show_phase_totals,
    defaultTaxRate: offer.default_tax_rate,
  };

  return (
    <SettingsSection
      description={s("taxesSectionDescription")}
      title={s("taxesSectionTitle")}
    >
      <SettingsCard>
        <PhaseDisplaySettingsCard
          contentScope="taxOnly"
          displaySettings={displaySettings}
          documentType="offer"
          onDisplaySettingChange={onDisplaySettingChange}
          showPhaseSettings={false}
          showTaxSettings
          taxRates={taxRates}
        />
        <SettingsCardSeparator />
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="shrink-0 text-muted-foreground text-sm">
            {s("noTaxReason")}
          </span>
          <div className="w-full min-w-0 sm:max-w-xs">
            <Input
              className="w-full"
              onChange={(event) =>
                onChange({ no_tax_reason: event.target.value })
              }
              value={offer.no_tax_reason ?? ""}
            />
          </div>
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}

export function OfferSettingsPhasesSection({
  offer,
  onChange,
  onDisplaySettingChange,
}: {
  offer: OfferListItem;
  onChange: (patch: Partial<OfferListItem>) => void;
  onDisplaySettingChange: (
    key:
      | "showPhaseIndex"
      | "phaseIndexPattern"
      | "showTaxPerItem"
      | "showPhaseTotals"
      | "defaultTaxRate",
    value: boolean | string | number
  ) => void;
}) {
  const { t } = useTranslation("offers");
  const s = (key: string) => t(`offers.settings.${key}`);

  const displaySettings = {
    defaultTaxRate: offer.default_tax_rate,
    phaseIndexPattern: offer.phase_index_pattern,
    showPhaseIndex: offer.show_phase_index,
    showPhaseTotals: offer.show_phase_totals,
    showTaxPerItem: offer.show_tax_per_item,
  };

  return (
    <SettingsSection
      description={s("phasesSectionDescription")}
      title={s("phasesSectionTitle")}
    >
      <SettingsCard>
        <div className="flex items-center justify-between p-4">
          <div className="min-w-0 pr-4">
            <p className="font-semibold text-sm">{s("enablePhases")}</p>
            <p className="text-muted-foreground text-sm">
              {s("enablePhasesDescription")}
            </p>
          </div>
          <Switch
            checked={offer.phases_enabled}
            onCheckedChange={(checked) => onChange({ phases_enabled: checked })}
          />
        </div>
        <SettingsCardSeparator />
        <PhaseDisplaySettingsCard
          contentScope="phaseOnly"
          displaySettings={displaySettings}
          documentType="offer"
          onDisplaySettingChange={onDisplaySettingChange}
          showPhaseSettings
          showTaxSettings={false}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export function OfferSettingsBillingSection({
  offer,
  onChange,
}: {
  offer: OfferListItem;
  onChange: (patch: Partial<OfferListItem>) => void;
}) {
  const { t } = useTranslation("offers");
  const s = (key: string) => t(`offers.settings.${key}`);

  return (
    <SettingsSection
      description={s("billingSectionDescription")}
      title={s("billingSectionTitle")}
    >
      <SettingsCard>
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="shrink-0 text-muted-foreground text-sm">
            {t("yourReference")}
          </span>
          <div className="w-full min-w-0 sm:max-w-xs">
            <Input
              className="w-full"
              onChange={(event) => onChange({ reference: event.target.value })}
              placeholder={t("referencePlaceholder")}
              value={offer.reference ?? ""}
            />
          </div>
        </div>
        <SettingsCardSeparator />
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="shrink-0 text-muted-foreground text-sm">
            {t("offerDate")}
          </span>
          <div className="w-full min-w-0 sm:max-w-xs">
            <DatePicker
              className="w-full"
              onChange={(next) => onChange({ offer_date: next })}
              value={offer.offer_date ?? null}
            />
          </div>
        </div>
        <SettingsCardSeparator />
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="shrink-0 text-muted-foreground text-sm">
            {t("validUntil")}
          </span>
          <div className="w-full min-w-0 sm:max-w-xs">
            <DatePicker
              className="w-full"
              onChange={(next) => onChange({ valid_until: next })}
              value={offer.valid_until ?? null}
            />
          </div>
        </div>
        <SettingsCardSeparator />
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="shrink-0 text-muted-foreground text-sm">
            {s("billingType")}
          </span>
          <div className="w-full min-w-0 sm:max-w-xs">
            <Select
              onValueChange={(value) =>
                onChange({
                  billing_type: value as OfferListItem["billing_type"],
                })
              }
              value={offer.billing_type}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={s("billingTypePlaceholder")}>
                  {offer.billing_type === "fixed_price"
                    ? s("billingTypeFixed")
                    : offer.billing_type === "time_and_materials"
                      ? s("billingTypeTime")
                      : offer.billing_type === "retainer"
                        ? s("billingTypeRetainer")
                        : offer.billing_type === "recurring"
                          ? s("billingTypeRecurring")
                          : s("billingTypePlaceholder")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed_price">
                  {s("billingTypeFixed")}
                </SelectItem>
                <SelectItem value="time_and_materials">
                  {s("billingTypeTime")}
                </SelectItem>
                <SelectItem value="retainer">
                  {s("billingTypeRetainer")}
                </SelectItem>
                <SelectItem value="recurring">
                  {s("billingTypeRecurring")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {offer.billing_type === "retainer" ||
        offer.billing_type === "recurring" ? (
          <>
            <SettingsCardSeparator />
            <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="shrink-0 text-muted-foreground text-sm">
                {s("billingInterval")}
              </span>
              <div className="w-full min-w-0 sm:max-w-xs">
                <Select
                  onValueChange={(value) =>
                    onChange({
                      billing_interval:
                        value as OfferListItem["billing_interval"],
                    })
                  }
                  value={offer.billing_interval ?? "monthly"}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(offer.billing_interval ?? "monthly") === "quarterly"
                        ? s("billingIntervalQuarterly")
                        : (offer.billing_interval ?? "monthly") === "yearly"
                          ? s("billingIntervalYearly")
                          : s("billingIntervalMonthly")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">
                      {s("billingIntervalMonthly")}
                    </SelectItem>
                    <SelectItem value="quarterly">
                      {s("billingIntervalQuarterly")}
                    </SelectItem>
                    <SelectItem value="yearly">
                      {s("billingIntervalYearly")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
}

export function OfferSettingsDangerSection({
  onDelete,
}: {
  onDelete: () => void;
}) {
  const { t } = useTranslation("offers");
  const s = (key: string) => t(`offers.settings.${key}`);

  return (
    <SettingsSection title={s("dangerZoneTitle")}>
      <section className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
        <p className="font-medium text-destructive text-sm">
          {s("deleteOfferCardTitle")}
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          {s("deleteOfferCardHint")}
        </p>
        <Button className="mt-3" onClick={onDelete} variant="destructive">
          {s("deleteOfferCardTitle")}
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
  t,
  ContactChooser,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedClientId: string;
  onSelectedClientIdChange: (id: string) => void;
  entities: OfferEntityListItem[];
  onSave: () => void;
  t: TFn;
  ContactChooser?: ContactChooserComponent | null;
}) {
  const entityChooserEntities = entities.map((e) => ({
    id: e.id,
    display_name: e.display_name,
  }));

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changeClient")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="font-medium text-sm">{t("client")}</p>
            {ContactChooser ? (
              <ContactChooser
                className="w-full"
                entities={entityChooserEntities}
                onChange={(id) => onSelectedClientIdChange(id ?? "__none__")}
                value={
                  selectedClientId === "__none__" ? null : selectedClientId
                }
              />
            ) : (
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
            )}
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
