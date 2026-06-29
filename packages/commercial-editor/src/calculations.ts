import type { CommercialBlock, CommercialTotals } from "./types.js";

interface LegacyLineItemLike {
  amount?: number;
  cost_per_item?: number;
  tax?: number;
}

interface NewLineItemLike {
  quantity?: number;
  tax_rate?: number;
  unit_price?: number;
}

function isNewLineItemContent(content: unknown): content is NewLineItemLike {
  if (!content || typeof content !== "object") {
    return false;
  }
  return (
    "quantity" in content && "unit_price" in content && "tax_rate" in content
  );
}

function isLegacyLineItemContent(
  content: unknown
): content is LegacyLineItemLike {
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
      let quantity = 0;
      let unitPrice = 0;
      let rate = fallbackTaxRate;
      if (isNewLineItemContent(content)) {
        quantity = Number(content.quantity ?? 0);
        unitPrice = Number(content.unit_price ?? 0);
        rate = Number(content.tax_rate ?? fallbackTaxRate);
      } else if (isLegacyLineItemContent(content)) {
        quantity = Number(content.amount ?? 0);
        unitPrice = Number(content.cost_per_item ?? 0);
        rate = Number(content.tax ?? fallbackTaxRate);
      } else {
        return acc;
      }
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
