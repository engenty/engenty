import type { SearchableSelectOption } from "@engenty/ui-core";
import type { GatewayModelOption } from "../../lib/admin/gateway-model-options-api";
import { formatGatewayModelPricingSummary } from "./format-gateway-model-pricing";

export function mapGatewayModelSelectOptions(
  models: GatewayModelOption[],
  t: (key: string) => string
): SearchableSelectOption[] {
  return models.map((model) => {
    const tierLabel = model.price_tier
      ? t(`fields.priceTier.${model.price_tier}`)
      : undefined;
    const pricingSummary = formatGatewayModelPricingSummary(
      model.input_per_mtok_micros,
      model.output_per_mtok_micros,
      {
        inLabel: t("fields.pricingIn"),
        outLabel: t("fields.pricingOut"),
        perMtokLabel: t("fields.pricingPerMtok"),
        unknownLabel: t("fields.pricingUnknown"),
      }
    );

    return {
      badgeLabel: tierLabel,
      description: pricingSummary,
      keywords: [model.provider, model.model_id, tierLabel, pricingSummary]
        .filter(Boolean)
        .join(" "),
      label: model.label,
      value: model.model_id,
    };
  });
}

export function mergeSelectedGatewayModelOptions(
  options: SearchableSelectOption[],
  selectedIds: Array<string | null | undefined>,
  unavailableLabel: string
): SearchableSelectOption[] {
  const byValue = new Map(options.map((option) => [option.value, option]));
  for (const selectedId of selectedIds) {
    if (!(selectedId && !byValue.has(selectedId))) {
      continue;
    }
    byValue.set(selectedId, {
      disabled: true,
      label: `${selectedId} (${unavailableLabel})`,
      value: selectedId,
    });
  }
  return [...byValue.values()];
}
