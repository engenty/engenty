import {
  Label,
  SearchableSelect,
  type SearchableSelectOption,
  SettingsFormSection,
} from "@engenty/ui-core";
import type { AiConfig } from "../../lib/admin/ai-settings-api";

interface GeneralSettingsCardProps {
  chatModelOptions: SearchableSelectOption[];
  routingModelOptions: SearchableSelectOption[];
  settings: AiConfig;
  t: (key: string) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

export function GeneralSettingsCard({
  chatModelOptions,
  routingModelOptions,
  settings,
  t,
  updateSettings,
}: GeneralSettingsCardProps) {
  return (
    <SettingsFormSection
      description={t("sections.generalDesc")}
      title={t("sections.general")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label className="shrink-0 sm:w-32 md:w-40" htmlFor="chat-model">
          {t("fields.chatModel")}
        </Label>
        <SearchableSelect
          emptyMessage={t("fields.modelSearchEmpty")}
          id="chat-model"
          onValueChange={(value) =>
            updateSettings("chat_model_id", value || null)
          }
          options={chatModelOptions}
          placeholder={t("fields.chatModelPlaceholder")}
          searchPlaceholder={t("fields.modelSearchPlaceholder")}
          triggerClassName="min-w-0 flex-1"
          value={settings.chat_model_id ?? ""}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label className="shrink-0 sm:w-32 md:w-40" htmlFor="routing-model">
          {t("fields.routingModel")}
        </Label>
        <SearchableSelect
          emptyMessage={t("fields.modelSearchEmpty")}
          id="routing-model"
          onValueChange={(value) =>
            updateSettings("coordinator_model_id", value || null)
          }
          options={routingModelOptions}
          placeholder={t("fields.routingModelPlaceholder")}
          searchPlaceholder={t("fields.modelSearchPlaceholder")}
          triggerClassName="min-w-0 flex-1"
          value={settings.coordinator_model_id ?? ""}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {t("sections.routingModelHint")}
      </p>
    </SettingsFormSection>
  );
}
