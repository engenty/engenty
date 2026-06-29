import { useTranslation } from "@engenty/i18n/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { FileText } from "lucide-react";
import type { TaxRate } from "../../types";
import {
  SettingsCard,
  SettingsCardSeparator,
} from "../shared/settings/SettingsCard";
import { SettingsSection } from "../shared/settings/SettingsSection";
import { PhaseDisplaySettingsCard } from "./PhaseDisplaySettingsCard";

interface Template {
  id: string;
  is_default?: boolean;
  name: string;
}

interface DisplaySettings {
  defaultTaxRate?: number;
  phaseIndexPattern: string;
  showPhaseIndex: boolean;
  showPhaseTotals: boolean;
  showTaxPerItem: boolean;
}

interface TemplateSettingsSectionProps {
  disabled?: boolean;
  displaySettings: DisplaySettings;
  documentType: "offer" | "invoice";
  includePhaseDisplaySettings?: boolean;
  loading?: boolean;
  onDisplaySettingChange: (
    key: keyof DisplaySettings,
    value: boolean | string | number
  ) => void;
  onTemplateChange: (id: string) => void;
  /** When set, overrides default title/description translation keys */
  sectionDescriptionKey?: string;
  sectionTitleKey?: string;
  showPhaseSettings?: boolean;
  showTaxSettings?: boolean;
  taxRates?: TaxRate[];
  templateId: string | null;
  templates: Template[];
}

export const TemplateSettingsSection = ({
  documentType,
  templateId,
  templates,
  onTemplateChange,
  displaySettings,
  onDisplaySettingChange,
  taxRates = [],
  disabled = false,
  loading = false,
  includePhaseDisplaySettings = true,
  sectionDescriptionKey,
  sectionTitleKey,
  showPhaseSettings = true,
  showTaxSettings = true,
}: TemplateSettingsSectionProps) => {
  const { t } = useTranslation("offers");

  const titleKey =
    sectionTitleKey ??
    (documentType === "offer"
      ? "offers.settings.template"
      : "invoices.settings.pdfTemplate");
  const descriptionKey =
    sectionDescriptionKey ??
    (documentType === "offer"
      ? "offers.settings.templateDescription"
      : "invoices.settings.pdfTemplateDescription");
  const selectPlaceholder =
    documentType === "offer"
      ? "offers.settings.selectTemplate"
      : "invoices.settings.selectTemplate";

  return (
    <SettingsSection description={t(descriptionKey)} title={t(titleKey)}>
      <SettingsCard>
        {templates.length > 0 && (
          <>
            <div className="flex items-center gap-3 p-4">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <Select
                disabled={disabled || loading}
                onValueChange={onTemplateChange}
                value={templateId || ""}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={t(selectPlaceholder)} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                      {template.is_default && ` (${t("common.default")})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {includePhaseDisplaySettings &&
              (showPhaseSettings || showTaxSettings) && (
                <SettingsCardSeparator />
              )}
          </>
        )}

        {includePhaseDisplaySettings &&
          (showPhaseSettings || showTaxSettings) && (
            <PhaseDisplaySettingsCard
              disabled={disabled}
              displaySettings={displaySettings}
              documentType={documentType}
              onDisplaySettingChange={onDisplaySettingChange}
              showPhaseSettings={showPhaseSettings}
              showTaxSettings={showTaxSettings}
              taxRates={taxRates}
            />
          )}
      </SettingsCard>
    </SettingsSection>
  );
};
