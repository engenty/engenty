import {
  type AiModelPurpose,
  DEFAULT_MODEL_GATEWAY_ID,
  formatModelRef,
} from "@engenty/ai-core/browser";
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
  "chat_model_id" | "classifier_model_id" | "fast_text_model_id"
>;

interface PurposeRow {
  capable: boolean;
  field: ModelField;
  options: MatrixCatalog;
  purpose: AiModelPurpose;
}

/** Which catalog availability a purpose picks from. */
export type MatrixCatalog = "agent" | "classification" | "text";

function modelsByRef(
  models: GatewayModelOption[]
): Map<string, GatewayModelOption> {
  return new Map(
    models.map((m) => [
      formatModelRef({
        gateway: m.gateway ?? DEFAULT_MODEL_GATEWAY_ID,
        modelId: m.model_id,
      }),
      m,
    ])
  );
}

/**
 * Display order mirrors AI_MODEL_PURPOSES. Each purpose picks from the models
 * activated for its role class: agent (tools), classification (Jev), text
 * (short text, no tools).
 */
const PURPOSE_ROWS: PurposeRow[] = [
  { purpose: "chat", field: "chat_model_id", options: "agent", capable: true },
  {
    purpose: "classifier",
    field: "classifier_model_id",
    options: "classification",
    capable: false,
  },
  {
    purpose: "fast_text",
    field: "fast_text_model_id",
    options: "text",
    capable: false,
  },
];

interface ModelMatrixCardProps {
  catalogs: Record<MatrixCatalog, GatewayModelOption[]>;
  effective: EffectiveAiSettings | undefined;
  maxPriceTier: "all" | GatewayModelPriceTier;
  settings: AiConfig;
  t: (key: string, opts?: Record<string, unknown>) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

export function ModelMatrixCard({
  catalogs,
  effective,
  maxPriceTier,
  settings,
  t,
  updateSettings,
}: ModelMatrixCardProps) {
  const [editing, setEditing] = useState<PurposeRow | null>(null);

  // Keyed by ref. A pinned value and the server's effective value are both refs
  // (`openrouter:openai/gpt-4o` when the gateway is not the default), so an
  // id-keyed map would both collapse the two gateways' rows for one model and
  // then fail to find either — the row would lose its price and capability
  // chips with nothing to say why.
  const byRef = useMemo(
    () => ({
      agent: modelsByRef(catalogs.agent),
      classification: modelsByRef(catalogs.classification),
      text: modelsByRef(catalogs.text),
    }),
    [catalogs]
  );

  const editingModels = editing ? catalogs[editing.options] : [];
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
              const catalog = byRef[row.options];
              const model = catalog.get(modelId);
              const price = model ? formatModelPrice(model) : null;
              const source = pinned ? "tenant" : eff?.source;

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
                    ) : source === "governance" ? (
                      <Badge variant="secondary">
                        {t("matrix.source.governance")}
                      </Badge>
                    ) : source ? (
                      <Badge variant="secondary">
                        {t("matrix.source.inheritPlatform")}
                      </Badge>
                    ) : null}
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
          capableOnlyDefault={editing.capable}
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
