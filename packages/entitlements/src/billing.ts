import type { EntitlementPackage } from "./types.js";

/** A metered snapshot for one billing period. All costs in `_micros`. */
export interface BillingUsage {
  /** Metered AI spend for the period (from ai.tenant_usage_policy period totals). */
  aiCostMicros: number;
  /** Active seats during the period. */
  userCount: number;
}

/** One computed invoice line. */
export interface InvoiceLine {
  amountMicros: number;
  description: string;
  kind: "base" | "seat_overage" | "ai_usage";
  quantity: number;
  unitPriceMicros: number;
}

export interface InvoiceComputation {
  currency: string;
  lines: InvoiceLine[];
  totalMicros: number;
}

/**
 * Turn a package's pricing + a period's metered usage into invoice lines. Pure.
 *
 * Lines: recurring base; seat overage for users beyond `includedUsers` at
 * `perExtraUser_micros`; AI usage passthrough when there is metered spend. A
 * package with no `pricing` bills nothing (empty, zero total).
 */
export function computeInvoiceLines(
  pkg: Pick<EntitlementPackage, "pricing">,
  usage: BillingUsage
): InvoiceComputation {
  const pricing = pkg.pricing;
  if (!pricing) {
    return { currency: "usd", lines: [], totalMicros: 0 };
  }

  const lines: InvoiceLine[] = [];

  lines.push({
    kind: "base",
    description: "Subscription",
    quantity: 1,
    unitPriceMicros: pricing.base_micros,
    amountMicros: pricing.base_micros,
  });

  const included = pricing.includedUsers ?? Number.POSITIVE_INFINITY;
  const extraUsers = Math.max(0, usage.userCount - included);
  if (extraUsers > 0 && pricing.perExtraUser_micros > 0) {
    lines.push({
      kind: "seat_overage",
      description: `Additional seats (${extraUsers})`,
      quantity: extraUsers,
      unitPriceMicros: pricing.perExtraUser_micros,
      amountMicros: extraUsers * pricing.perExtraUser_micros,
    });
  }

  if (usage.aiCostMicros > 0) {
    lines.push({
      kind: "ai_usage",
      description: "AI usage",
      quantity: 1,
      unitPriceMicros: usage.aiCostMicros,
      amountMicros: usage.aiCostMicros,
    });
  }

  const totalMicros = lines.reduce((sum, line) => sum + line.amountMicros, 0);
  return { currency: pricing.currency, lines, totalMicros };
}
