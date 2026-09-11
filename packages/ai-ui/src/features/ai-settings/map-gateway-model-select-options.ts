import {
  DEFAULT_MODEL_GATEWAY_ID,
  formatModelRef,
} from "@engenty/ai-core/browser";
import type { SearchableSelectOption } from "@engenty/ui-core";
import type { GatewayModelOption } from "../../lib/admin/gateway-model-options-api";
import { formatGatewayModelPricingSummary } from "./format-gateway-model-pricing";

/**
 * Options are valued by model **ref**, not by model id.
 *
 * With one gateway those are the same string, which is why keying on the id
 * worked. With two, the same `openai/gpt-4o` appears once per gateway at each
 * one's price, and an id-keyed option list silently collapses them into
 * whichever arrived last.
 */
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

    // Name the gateway only when it is not the default, so a single-gateway
    // install sees exactly the rows it saw before.
    const gateway = model.gateway ?? DEFAULT_MODEL_GATEWAY_ID;
    const showGateway = gateway !== DEFAULT_MODEL_GATEWAY_ID;

    return {
      badgeLabel: tierLabel,
      description: showGateway
        ? `${gateway} · ${pricingSummary}`
        : pricingSummary,
      keywords: [
        model.provider,
        model.model_id,
        gateway,
        tierLabel,
        pricingSummary,
      ]
        .filter(Boolean)
        .join(" "),
      label: model.label,
      value: formatModelRef({ gateway, modelId: model.model_id }),
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
