import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormSection,
} from "@engenty/ui-core";
import type { AiConfig } from "../../lib/admin/ai-settings-api";

interface ModelOption {
  disabled?: boolean;
  label: string;
  value: string;
}

interface ClassifierSettingsCardProps {
  modelOptions: ModelOption[];
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
        <Select
          onValueChange={(value) =>
            updateSettings("classifier_model_id", value || null)
          }
          value={settings.classifier_model_id ?? ""}
        >
          <SelectTrigger className="min-w-0 flex-1" id="classifier-model">
            <SelectValue placeholder={t("fields.classifierModelPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((option) => (
              <SelectItem
                disabled={option.disabled}
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("sections.classifierHint")}
      </p>
    </SettingsFormSection>
  );
}
