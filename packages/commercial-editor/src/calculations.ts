import type { CommercialBlock, CommercialTotals } from "./types.js";

interface LineItemLike {
  amount?: number;
  cost_per_item?: number;
  tax?: number;
}

/**
 * Canonical line-item content: `amount` / `cost_per_item` / `tax`. Agent-written
 * `quantity` / `unit_price` / `tax_rate` is converted at the write boundary by
 * `normalizeCommercialBlock`, so nothing stored reaches here under an alias.
 */
function isLineItemContent(content: unknown): content is LineItemLike {
  if (!content || typeof content !== "object") {
    return false;
  }
  return "amount" in content && "cost_per_item" in content;
}

export function calculateTotals(
  blocks: CommercialBlock[],
  fallbackTaxRate = 20
): CommercialTotals {
  return blocks.reduce<CommercialTotals>(
    (acc, block) => {
      if (block.type !== "line_item") {
        return acc;
      }
      const content = block.content;
      if (!isLineItemContent(content)) {
        return acc;
      }
      const quantity = Number(content.amount ?? 0);
      const unitPrice = Number(content.cost_per_item ?? 0);
      const rate = Number(content.tax ?? fallbackTaxRate);
      const net = quantity * unitPrice;
      const tax = net * (rate / 100);
      return {
        net: acc.net + net,
        tax: acc.tax + tax,
        gross: acc.gross + net + tax,
      };
    },
    { net: 0, tax: 0, gross: 0 }
  );
}
