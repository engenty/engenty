import {
  Label,
  SearchableSelect,
  type SearchableSelectOption,
  SettingsFormSection,
} from "@engenty/ui-core";
import type { AiConfig } from "../../lib/admin/ai-settings-api";

interface ClassifierSettingsCardProps {
  modelOptions: SearchableSelectOption[];
  settings: AiConfig;
  t: (key: string) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

export function ClassifierSettingsCard({
  modelOptions,
  settings,
  t,
  updateSettings,
}: ClassifierSettingsCardProps) {
  return (
    <SettingsFormSection
      description={t("sections.classifierDesc")}
      title={t("sections.classifier")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label className="shrink-0 sm:w-32 md:w-40" htmlFor="classifier-model">
          {t("fields.classifierModel")}
        </Label>
        <SearchableSelect
          emptyMessage={t("fields.modelSearchEmpty")}
          id="classifier-model"
          onValueChange={(value) =>
            updateSettings("classifier_model_id", value || null)
          }
          options={modelOptions}
          placeholder={t("fields.classifierModelPlaceholder")}
          searchPlaceholder={t("fields.modelSearchPlaceholder")}
          triggerClassName="min-w-0 flex-1"
          value={settings.classifier_model_id ?? ""}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {t("sections.classifierHint")}
      </p>
    </SettingsFormSection>
  );
}
