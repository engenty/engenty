import { Badge } from "@engenty/ui-core";
import type {
  GatewayModelOption,
  GatewayModelPriceTier,
} from "../../lib/admin/gateway-model-options-api";
import { formatMicrosPerMtok } from "./format-gateway-model-pricing";

const TIER_RANK: Record<GatewayModelPriceTier, number> = {
  cheap: 0,
  low: 1,
  medium: 2,
  high: 3,
  expensive: 4,
};

/** Keep models at or below the chosen tier; unpriced models always pass. */
export function withinPriceTier(
  model: GatewayModelOption,
  maxTier: "all" | GatewayModelPriceTier
): boolean {
  if (maxTier === "all" || model.price_tier == null) {
    return true;
  }
  return TIER_RANK[model.price_tier] <= TIER_RANK[maxTier];
}

/** `$0.90 / $3.20` input/output per Mtok, or null when unpriced. */
export function formatModelPrice(model: GatewayModelOption): string | null {
  const input = formatMicrosPerMtok(model.input_per_mtok_micros);
  const output = formatMicrosPerMtok(model.output_per_mtok_micros);
  if (!(input || output)) {
    return null;
  }
  return `${input ?? "—"} / ${output ?? "—"}`;
}

function formatContextWindow(tokens: number | null): string | null {
  if (tokens == null || tokens <= 0) {
    return null;
  }
  if (tokens >= 1_000_000) {
    return `${Math.round(tokens / 1_000_000)}M`;
  }
  return `${Math.round(tokens / 1000)}K`;
}

interface CapabilityChipsProps {
  model: GatewayModelOption;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

/** Small capability chips: context window, vision, web search, code. */
export function ModelCapabilityChips({ model, t }: CapabilityChipsProps) {
  const ctx = formatContextWindow(model.context_tokens);
  const hasCode = model.use_cases.includes("code");

  return (
    <div className="flex flex-wrap items-center gap-1">
      {ctx ? (
        <Badge className="font-normal" variant="secondary">
          {t("matrix.caps.context", { tokens: ctx })}
        </Badge>
      ) : null}
      {model.vision ? (
        <Badge className="font-normal" variant="secondary">
          {t("matrix.caps.vision")}
        </Badge>
      ) : null}
      {model.web_search ? (
        <Badge className="font-normal" variant="secondary">
          {t("matrix.caps.web")}
        </Badge>
      ) : null}
      {hasCode ? (
        <Badge className="font-normal" variant="secondary">
          {t("matrix.caps.code")}
        </Badge>
      ) : null}
    </div>
  );
}
