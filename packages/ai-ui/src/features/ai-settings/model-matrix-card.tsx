import type { AiModelPurpose } from "@engenty/ai-core/browser";
import { Badge, Button, SettingsFormSection } from "@engenty/ui-core";
import { useMemo, useState } from "react";
import type { AiConfig } from "../../lib/admin/ai-settings-api";
import type { EffectiveAiSettings } from "../../lib/admin/effective-ai-settings-api";
import type {
  GatewayModelOption,
  GatewayModelPriceTier,
} from "../../lib/admin/gateway-model-options-api";
import {
  formatModelPrice,
  ModelCapabilityChips,
} from "./model-catalog-display";
import { ModelPickerDialog } from "./model-picker-dialog";

type ModelField = Extract<
  keyof AiConfig,
  | "chat_model_id"
  | "coordinator_model_id"
  | "classifier_model_id"
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
  { purpose: "classifier", field: "classifier_model_id", options: "routing" },
  { purpose: "research", field: "research_model_id", options: "chat" },
  {
    purpose: "planning_coding",
    field: "planning_coding_model_id",
    options: "chat",
  },
  { purpose: "safeguard", field: "safeguard_model_id", options: "chat" },
];

interface ModelMatrixCardProps {
  chatModels: GatewayModelOption[];
  effective: EffectiveAiSettings | undefined;
  maxPriceTier: "all" | GatewayModelPriceTier;
  routingModels: GatewayModelOption[];
  settings: AiConfig;
  t: (key: string, opts?: Record<string, unknown>) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

export function ModelMatrixCard({
  chatModels,
  effective,
  maxPriceTier,
  routingModels,
  settings,
  t,
  updateSettings,
}: ModelMatrixCardProps) {
  const [editing, setEditing] = useState<PurposeRow | null>(null);

  const chatById = useMemo(
    () => new Map(chatModels.map((m) => [m.model_id, m])),
    [chatModels]
  );
  const routingById = useMemo(
    () => new Map(routingModels.map((m) => [m.model_id, m])),
    [routingModels]
  );

  const editingModels =
    editing?.options === "routing" ? routingModels : chatModels;
  const editingEff = editing ? effective?.models[editing.purpose] : undefined;

  return (
    <SettingsFormSection
      description={t("matrix.description")}
      title={t("matrix.title")}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-border border-b text-left">
              <th className="pb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                {t("matrix.col.purpose")}
              </th>
              <th className="pb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                {t("matrix.col.model")}
              </th>
              <th className="pb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                {t("matrix.col.source")}
              </th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {PURPOSE_ROWS.map((row) => {
              const pinned =
                (settings[row.field] as string | null | undefined) ?? null;
              const eff = effective?.models[row.purpose];
              // A local (unsaved) pin wins over the server-resolved effective
              // value so the row reflects the pending change immediately.
              const modelId = pinned ?? eff?.value ?? "";
              const catalog =
                row.options === "routing" ? routingById : chatById;
              const model = catalog.get(modelId);
              const price = model ? formatModelPrice(model) : null;
              const source = pinned ? "tenant" : (eff?.source ?? "default");

              return (
                <tr
                  className="border-border border-b align-top"
                  key={row.purpose}
                >
                  <td className="py-3 pr-4">
                    <div className="font-medium text-sm">
                      {t(`matrix.purpose.${row.purpose}.label`)}
                    </div>
                    <div className="mt-0.5 max-w-xs text-muted-foreground text-xs">
                      {t(`matrix.purpose.${row.purpose}.desc`)}
                    </div>
                  </td>

                  <td className="py-3 pr-4">
                    <div className="font-mono text-sm">{modelId}</div>
                    {price ? (
                      <div className="mt-0.5 font-mono text-muted-foreground text-xs tabular-nums">
                        {price}
                        {model?.price_tier
                          ? ` · ${t(`fields.priceTier.${model.price_tier}`)}`
                          : ""}
                      </div>
                    ) : null}
                    {model ? (
                      <div className="mt-1">
                        <ModelCapabilityChips model={model} t={t} />
                      </div>
                    ) : null}
                  </td>

                  <td className="py-3 pr-4">
                    {source === "tenant" ? (
                      <Badge variant="default">
                        {t("matrix.source.pinned")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        {source === "platform"
                          ? t("matrix.source.inheritPlatform")
                          : t("matrix.source.inheritDefault")}
                      </Badge>
                    )}
                  </td>

                  <td className="py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <Button
                        className="h-auto px-0 text-primary text-xs"
                        onClick={() => setEditing(row)}
                        size="sm"
                        type="button"
                        variant="link"
                      >
                        {pinned
                          ? t("matrix.action.change")
                          : t("matrix.action.pin")}
                      </Button>
                      {pinned ? (
                        <Button
                          className="h-auto px-0 text-muted-foreground text-xs"
                          onClick={() => updateSettings(row.field, null)}
                          size="sm"
                          type="button"
                          variant="link"
                        >
                          {t("matrix.inheritAction")}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? (
        <ModelPickerDialog
          inheritedValue={editingEff?.inherited.value ?? ""}
          maxPriceTier={maxPriceTier}
          models={editingModels}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
            }
          }}
          onSelect={(modelId) => updateSettings(editing.field, modelId)}
          open={true}
          purposeLabel={t(`matrix.purpose.${editing.purpose}.label`)}
          t={t}
          value={(settings[editing.field] as string | null | undefined) ?? null}
        />
      ) : null}
    </SettingsFormSection>
  );
}
