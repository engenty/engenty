import { describe, expect, it } from "vitest";
import { normalizeCommercialBlock } from "./blocks-normalize.js";
import { calculateTotals } from "./calculations.js";

describe("normalizeCommercialBlock", () => {
  it("maps intuitive line_item aliases to the canonical editor keys", () => {
    // Exactly what a model guesses (and what the stale createEmptyBlock
    // helper suggests): quantity/unit_price/tax_rate. The editor, PDF, and
    // phase subtotals read amount/cost_per_item/tax.
    expect(
      normalizeCommercialBlock({
        type: "line_item",
        content: {
          title: "UX-Konzept",
          quantity: 3,
          unit: "Tage",
          unit_price: 1100,
          tax_rate: 20,
        },
      })
    ).toEqual({
      type: "line_item",
      content: {
        title: "UX-Konzept",
        amount: 3,
        unit: "Tage",
        cost_per_item: 1100,
        tax: 20,
      },
    });
  });

  it("keeps canonical line_item content untouched", () => {
    const canonical = {
      title: "Frontend",
      amount: 8,
      unit: "Tage",
      cost_per_item: 1300,
      tax: 20,
    };
    expect(
      normalizeCommercialBlock({ type: "line_item", content: canonical })
    ).toEqual({ type: "line_item", content: canonical });
  });

  it("prefers canonical keys when both shapes are present and drops aliases", () => {
    // Aliases must not survive: a later manual edit in the editor writes only
    // the canonical keys, and a stale alias copy would diverge the totals.
    expect(
      normalizeCommercialBlock({
        type: "line_item",
        content: {
          amount: 5,
          quantity: 99,
          cost_per_item: 100,
          unit_price: 7,
          tax: 10,
          tax_rate: 77,
        },
      })
    ).toEqual({
      type: "line_item",
      content: { amount: 5, cost_per_item: 100, tax: 10 },
    });
  });

  it("maps a line_item description to the canonical content key", () => {
    expect(
      normalizeCommercialBlock({
        type: "line_item",
        content: {
          title: "Deployment",
          description: "Go-Live & Monitoring",
          amount: 2,
          cost_per_item: 1200,
        },
      })
    ).toEqual({
      type: "line_item",
      content: {
        title: "Deployment",
        content: "Go-Live & Monitoring",
        amount: 2,
        cost_per_item: 1200,
      },
    });
  });

  it("converts a phase block to the canonical headline + is_phase shape", () => {
    // The editor and PDF have NO rendered "phase" type — a phase is a
    // headline block with is_phase: true and the name in `title`.
    expect(
      normalizeCommercialBlock({
        type: "phase",
        content: { title: "Konzeption & Planung" },
      })
    ).toEqual({
      type: "headline",
      content: { title: "Konzeption & Planung", is_phase: true },
    });
    // Common alias: name in `text`.
    expect(
      normalizeCommercialBlock({
        type: "phase",
        content: { text: "Umsetzung" },
      })
    ).toEqual({
      type: "headline",
      content: { title: "Umsetzung", is_phase: true },
    });
  });

  it("maps headline/subheading text alias to title", () => {
    expect(
      normalizeCommercialBlock({
        type: "headline",
        content: { text: "Leistungen" },
      })
    ).toEqual({ type: "headline", content: { title: "Leistungen" } });
    expect(
      normalizeCommercialBlock({
        type: "subheading",
        content: { title: "Recherche" },
      })
    ).toEqual({ type: "subheading", content: { title: "Recherche" } });
  });

  it("maps text-block aliases to the canonical content key", () => {
    expect(
      normalizeCommercialBlock({
        type: "text",
        content: { text: "Alle Preise netto." },
      })
    ).toEqual({ type: "text", content: { content: "Alle Preise netto." } });
    expect(
      normalizeCommercialBlock({
        type: "text",
        content: { content: "Bereits kanonisch." },
      })
    ).toEqual({ type: "text", content: { content: "Bereits kanonisch." } });
  });
});

describe("normalizeCommercialBlock + calculateTotals", () => {
  it("makes an alias-written line item count toward the totals", () => {
    // The readers are canonical-only by design: normalization at the write
    // boundary is what makes an agent-written item countable at all.
    const written = {
      title: "Setup",
      quantity: 2,
      unit_price: 500,
      tax_rate: 20,
    };
    expect(
      calculateTotals([
        { id: "a", order_index: 0, type: "line_item", content: written },
      ])
    ).toEqual({ net: 0, tax: 0, gross: 0 });
    const normalized = normalizeCommercialBlock({
      type: "line_item",
      content: written,
    });
    expect(
      calculateTotals([
        {
          id: "a",
          order_index: 0,
          type: "line_item",
          content: normalized.content,
        },
      ])
    ).toEqual({ net: 1000, tax: 200, gross: 1200 });
  });
});
