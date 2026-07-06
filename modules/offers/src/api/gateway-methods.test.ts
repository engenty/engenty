import { describe, expect, it } from "vitest";
import {
  applyOfferBlockEdits,
  normalizeAgentBlock,
  type OfferBlockEditEntry,
} from "./gateway-methods.js";

describe("normalizeAgentBlock", () => {
  it("maps intuitive line_item aliases to the canonical editor keys", () => {
    // Exactly what a model guesses (and what the stale createEmptyBlock
    // helper suggests): quantity/unit_price/tax_rate. The editor, PDF, and
    // phase subtotals read amount/cost_per_item/tax.
    expect(
      normalizeAgentBlock({
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
      normalizeAgentBlock({ type: "line_item", content: canonical })
    ).toEqual({ type: "line_item", content: canonical });
  });

  it("prefers canonical keys when both shapes are present and drops aliases", () => {
    // Aliases must not survive: a later manual edit in the editor writes only
    // the canonical keys, and a stale alias copy would diverge the totals.
    expect(
      normalizeAgentBlock({
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
      normalizeAgentBlock({
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
      normalizeAgentBlock({
        type: "phase",
        content: { title: "Konzeption & Planung" },
      })
    ).toEqual({
      type: "headline",
      content: { title: "Konzeption & Planung", is_phase: true },
    });
    // Common alias: name in `text`.
    expect(
      normalizeAgentBlock({ type: "phase", content: { text: "Umsetzung" } })
    ).toEqual({
      type: "headline",
      content: { title: "Umsetzung", is_phase: true },
    });
  });

  it("maps headline/subheading text alias to title", () => {
    expect(
      normalizeAgentBlock({ type: "headline", content: { text: "Leistungen" } })
    ).toEqual({ type: "headline", content: { title: "Leistungen" } });
    expect(
      normalizeAgentBlock({
        type: "subheading",
        content: { title: "Recherche" },
      })
    ).toEqual({ type: "subheading", content: { title: "Recherche" } });
  });

  it("maps text-block aliases to the canonical content key", () => {
    expect(
      normalizeAgentBlock({
        type: "text",
        content: { text: "Alle Preise netto." },
      })
    ).toEqual({ type: "text", content: { content: "Alle Preise netto." } });
    expect(
      normalizeAgentBlock({
        type: "text",
        content: { content: "Bereits kanonisch." },
      })
    ).toEqual({ type: "text", content: { content: "Bereits kanonisch." } });
  });
});

function block(
  id: string,
  order_index: number,
  type = "line_item",
  content_json: Record<string, unknown> = { title: id }
): OfferBlockEditEntry {
  return { id, offer_id: "offer-1", type, content_json, order_index };
}

describe("applyOfferBlockEdits", () => {
  const current = [block("a", 0), block("b", 1), block("c", 2)];

  it("deletes by id and reindexes", () => {
    const next = applyOfferBlockEdits("offer-1", current, { delete: ["b"] });
    expect(next.map((b) => [b.id, b.order_index])).toEqual([
      ["a", 0],
      ["c", 1],
    ]);
  });

  it("updates a block in place, preserving its position", () => {
    const next = applyOfferBlockEdits("offer-1", current, {
      upsert: [
        {
          id: "b",
          type: "line_item",
          content_json: { title: "B2", amount: 4, cost_per_item: 100, tax: 20 },
        },
      ],
    });
    expect(next.map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(next[1]?.content_json).toMatchObject({ title: "B2", amount: 4 });
  });

  it("normalizes upserted content (aliases + phase type)", () => {
    const next = applyOfferBlockEdits("offer-1", current, {
      upsert: [
        {
          type: "phase",
          content_json: { title: "Neue Phase" },
          after_id: null,
        },
      ],
    });
    expect(next[0]).toMatchObject({
      type: "headline",
      content_json: { title: "Neue Phase", is_phase: true },
      order_index: 0,
    });
    expect(next.map((b) => b.id).slice(1)).toEqual(["a", "b", "c"]);
  });

  it("appends new blocks by default", () => {
    const next = applyOfferBlockEdits("offer-1", current, {
      upsert: [{ type: "text", content_json: { content: "Schluss" } }],
    });
    expect(next).toHaveLength(4);
    expect(next[3]).toMatchObject({
      id: "",
      type: "text",
      order_index: 3,
    });
  });

  it("inserts after an anchor block", () => {
    const next = applyOfferBlockEdits("offer-1", current, {
      upsert: [
        { type: "text", content_json: { content: "Zwischen" }, after_id: "a" },
      ],
    });
    expect(next.map((b) => b.id)).toEqual(["a", "", "b", "c"]);
    expect(next.map((b) => b.order_index)).toEqual([0, 1, 2, 3]);
  });

  it("repositions an existing block via order_index", () => {
    const next = applyOfferBlockEdits("offer-1", current, {
      upsert: [
        {
          id: "c",
          type: "line_item",
          content_json: { title: "c" },
          order_index: 0,
        },
      ],
    });
    expect(next.map((b) => b.id)).toEqual(["c", "a", "b"]);
  });

  it("combines delete and upsert in one call", () => {
    const next = applyOfferBlockEdits("offer-1", current, {
      delete: ["a"],
      upsert: [
        { id: "b", type: "line_item", content_json: { title: "B-neu" } },
        { type: "text", content_json: { content: "Ende" } },
      ],
    });
    expect(next.map((b) => b.id)).toEqual(["b", "c", ""]);
    expect(next[0]?.content_json).toMatchObject({ title: "B-neu" });
  });
});
