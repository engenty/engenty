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

interface GeneralSettingsCardProps {
  modelOptions: ModelOption[];
  settings: AiConfig;
  t: (key: string) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

export function GeneralSettingsCard({
  modelOptions,
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
        <Select
          onValueChange={(value) =>
            updateSettings("chat_model_id", value || null)
          }
          value={settings.chat_model_id ?? ""}
        >
          <SelectTrigger className="min-w-0 flex-1" id="chat-model">
            <SelectValue placeholder={t("fields.chatModelPlaceholder")} />
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label className="shrink-0 sm:w-32 md:w-40" htmlFor="coordinator-model">
          {t("fields.coordinatorModel")}
        </Label>
        <Select
          onValueChange={(value) =>
            updateSettings("coordinator_model_id", value || null)
          }
          value={settings.coordinator_model_id ?? ""}
        >
          <SelectTrigger className="min-w-0 flex-1" id="coordinator-model">
            <SelectValue
              placeholder={t("fields.coordinatorModelPlaceholder")}
            />
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
    </SettingsFormSection>
  );
}
