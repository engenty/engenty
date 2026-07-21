import type { AiModelPurpose } from "@engenty/ai-core/browser";
import {
  Badge,
  Button,
  Label,
  SearchableSelect,
  type SearchableSelectOption,
  SettingsFormSection,
} from "@engenty/ui-core";
import { RotateCcw } from "lucide-react";
import type { AiConfig } from "../../lib/admin/ai-settings-api";
import type { EffectiveAiSettings } from "../../lib/admin/effective-ai-settings-api";

type ModelField = Extract<
  keyof AiConfig,
  | "chat_model_id"
  | "coordinator_model_id"
  | "research_model_id"
  | "planning_coding_model_id"
  | "safeguard_model_id"
>;

interface PurposeRow {
  field: ModelField;
  options: "chat" | "routing";
  purpose: AiModelPurpose;
}

/** Display order mirrors AI_MODEL_PURPOSES. Routing uses the routing catalog. */
const PURPOSE_ROWS: PurposeRow[] = [
  { purpose: "chat", field: "chat_model_id", options: "chat" },
  { purpose: "routing", field: "coordinator_model_id", options: "routing" },
  { purpose: "research", field: "research_model_id", options: "chat" },
  {
    purpose: "planning_coding",
    field: "planning_coding_model_id",
    options: "chat",
  },
  { purpose: "safeguard", field: "safeguard_model_id", options: "chat" },
];

interface ModelMatrixCardProps {
  chatModelOptions: SearchableSelectOption[];
  effective: EffectiveAiSettings | undefined;
  routingModelOptions: SearchableSelectOption[];
  settings: AiConfig;
  t: (key: string, opts?: Record<string, unknown>) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

export function ModelMatrixCard({
  chatModelOptions,
  effective,
  routingModelOptions,
  settings,
  t,
  updateSettings,
}: ModelMatrixCardProps) {
  return (
    <SettingsFormSection
      description={t("matrix.description")}
      title={t("matrix.title")}
    >
      <div className="flex flex-col divide-y divide-border">
        {PURPOSE_ROWS.map((row) => {
          const pinned =
            (settings[row.field] as string | null | undefined) ?? null;
          const eff = effective?.models[row.purpose];
          const options =
            row.options === "routing" ? routingModelOptions : chatModelOptions;
          const inheritedValue = eff?.inherited.value ?? "";
          const inheritedSource = eff?.inherited.source ?? "default";

          return (
            <div
              className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4"
              key={row.purpose}
            >
              <div className="sm:w-48 sm:shrink-0">
                <Label htmlFor={`model-${row.purpose}`}>
                  {t(`matrix.purpose.${row.purpose}.label`)}
                </Label>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {t(`matrix.purpose.${row.purpose}.desc`)}
                </p>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <SearchableSelect
                  emptyMessage={t("fields.modelSearchEmpty")}
                  id={`model-${row.purpose}`}
                  onValueChange={(value) =>
                    updateSettings(row.field, value || null)
                  }
                  options={options}
                  placeholder={
                    inheritedValue
                      ? t("matrix.inheritHint", { model: inheritedValue })
                      : t("fields.modelSearchPlaceholder")
                  }
                  searchPlaceholder={t("fields.modelSearchPlaceholder")}
                  triggerClassName="min-w-0 flex-1"
                  value={pinned ?? ""}
                />

                <div className="flex items-center gap-2">
                  {pinned ? (
                    <>
                      <Badge variant="default">
                        {t("matrix.source.pinned")}
                      </Badge>
                      <Button
                        className="h-6 gap-1 px-1.5 text-muted-foreground text-xs"
                        onClick={() => updateSettings(row.field, null)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {t("matrix.inheritAction")}
                      </Button>
                    </>
                  ) : (
                    <Badge variant="secondary">
                      {inheritedSource === "platform"
                        ? t("matrix.source.inheritPlatform")
                        : t("matrix.source.inheritDefault")}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SettingsFormSection>
  );
}
