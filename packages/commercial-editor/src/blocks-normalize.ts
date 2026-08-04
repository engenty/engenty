/**
 * Canonical block normalization for commercial documents (offers, invoices).
 *
 * Pure module — no React, no editor imports — so module *server* code can use
 * it without pulling the editor package's UI graph in.
 */

/**
 * Normalize an agent-written block to the CANONICAL shape the editor, PDF
 * templates, and phase grouping actually read (verified against
 * ItemBlockRow/HeadlineBlock/TextBlock, `groupBlocksForEditor`, and the PDF
 * provider's sample data):
 *
 * - line_item:  { title, amount, unit, cost_per_item, tax, content? }
 * - headline:   { title, content?, is_phase? } — a PHASE is a headline block
 *               with `is_phase: true` (there is no rendered "phase" type!)
 * - subheading: { title }
 * - text:       { content }
 *
 * Models overwhelmingly guess `quantity`/`unit_price`/`tax_rate`, `text`, and
 * a literal `type: "phase"` — all of which stored fine but rendered as 0 or
 * not at all. Accept the intuitive shapes here and convert, dropping aliases
 * so a later manual edit in the editor cannot diverge from a stale copy.
 *
 * This is the ONE implementation: both `offers_replace_blocks`/
 * `offers_update_blocks` and `invoices_replace_blocks` funnel through it so a
 * line item written by an agent looks identical to one drawn in the editor.
 */
export function normalizeCommercialBlock(input: {
  content: Record<string, unknown>;
  type: string;
}): { content: Record<string, unknown>; type: string } {
  const next: Record<string, unknown> = { ...input.content };
  if (input.type === "line_item") {
    if (next.amount == null && next.quantity != null) {
      next.amount = next.quantity;
    }
    if (next.cost_per_item == null && next.unit_price != null) {
      next.cost_per_item = next.unit_price;
    }
    if (next.cost_per_item == null && next.price != null) {
      next.cost_per_item = next.price;
    }
    if (next.tax == null && next.tax_rate != null) {
      next.tax = next.tax_rate;
    }
    // Optional secondary description line renders from `content`.
    if (
      typeof next.content !== "string" &&
      typeof next.description === "string"
    ) {
      next.content = next.description;
    }
    const {
      description: _description,
      quantity: _quantity,
      unit_price: _unit_price,
      price: _price,
      tax_rate: _tax_rate,
      ...content
    } = next;
    return { content, type: input.type };
  }
  if (
    input.type === "phase" ||
    input.type === "headline" ||
    input.type === "subheading"
  ) {
    let content: Record<string, unknown> = next;
    if (
      (typeof content.title !== "string" || content.title.length === 0) &&
      typeof content.text === "string"
    ) {
      const { text, ...rest } = content;
      content = { ...rest, title: text };
    }
    if (input.type === "phase") {
      return { content: { ...content, is_phase: true }, type: "headline" };
    }
    return { content, type: input.type };
  }
  if (input.type === "text") {
    let content: Record<string, unknown> = next;
    if (typeof content.content !== "string" || content.content.length === 0) {
      if (typeof content.text === "string" && content.text.length > 0) {
        const { text, ...rest } = content;
        content = { ...rest, content: text };
      } else if (
        typeof content.title === "string" &&
        content.title.length > 0
      ) {
        const { title, ...rest } = content;
        content = { ...rest, content: title };
      }
    }
    return { content, type: input.type };
  }
  return { content: next, type: input.type };
}
