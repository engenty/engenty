import { describe, expect, it } from "vitest";
import {
  applyOfferBlockEdits,
  type OfferBlockEditEntry,
} from "./gateway-methods.js";

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
