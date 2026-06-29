import type { CommercialBlock } from "../../types/blocks";
import type { CommercialTotals } from "../../types/calculations";
import { normalizeTaxRate } from "./taxes";

function isLineItem(block: CommercialBlock): boolean {
  return block.type === "line_item";
}

export function calculateCommercialTotals(
  blocks: CommercialBlock[],
  defaultTaxRate?: number
): CommercialTotals {
  const itemBlocks = blocks.filter(isLineItem);

  const subtotal = itemBlocks.reduce((sum, b) => {
    const c = b.content as Record<string, unknown>;
    const amount = Number(c.amount) || 0;
    const costPerItem = Number(c.cost_per_item) || 0;
    return sum + amount * costPerItem;
  }, 0);

  const taxMap = new Map<number, number>();

  itemBlocks.forEach((b) => {
    const c = b.content as Record<string, unknown>;
    const amount = Number(c.amount) || 0;
    const costPerItem = Number(c.cost_per_item) || 0;
    const itemSubtotal = amount * costPerItem;
    const taxRate = normalizeTaxRate(
      defaultTaxRate === undefined ? Number(c.tax) : defaultTaxRate
    );
    const taxAmount = itemSubtotal * (taxRate / 100);
    taxMap.set(taxRate, (taxMap.get(taxRate) || 0) + taxAmount);
  });

  const taxBreakdown = Array.from(taxMap.entries())
    .filter(([, amount]) => amount > 0)
    .map(([rate, amount]) => ({ rate, amount }))
    .sort((a, b) => b.rate - a.rate);

  const taxAmount = taxBreakdown.reduce((sum, t) => sum + t.amount, 0);
  const total = subtotal + taxAmount;
  const showTaxes =
    taxBreakdown.length > 0 && taxBreakdown.some((t) => t.rate > 0);

  return { subtotal, taxAmount, total, taxBreakdown, showTaxes };
}

export function hasItemBlocks(blocks: { type: string }[]): boolean {
  return blocks.some((b) => b.type === "line_item");
}
