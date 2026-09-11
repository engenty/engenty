import { describe, expect, it } from "vitest";
import {
  kbTemplatePropertyKeyFromLabel,
  normalizeSuggestedTemplateProperties,
} from "./source-template-suggestion.js";

function ids() {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
}

describe("kbTemplatePropertyKeyFromLabel", () => {
  it("slugifies a plain label", () => {
    expect(kbTemplatePropertyKeyFromLabel("Effective date")).toBe(
      "effective-date"
    );
  });

  it("transliterates German umlauts instead of dropping them", () => {
    // "Zuständigkeit" must not collapse to "zust-ndigkeit".
    expect(kbTemplatePropertyKeyFromLabel("Zuständigkeit")).toBe(
      "zustaendigkeit"
    );
    expect(kbTemplatePropertyKeyFromLabel("Größe")).toBe("groesse");
  });

  it("never emits a leading or trailing hyphen", () => {
    expect(kbTemplatePropertyKeyFromLabel("  § 12 — Bauwerk  ")).toBe(
      "12-bauwerk"
    );
  });

  it("returns empty for a label with nothing sluggable", () => {
    expect(kbTemplatePropertyKeyFromLabel("§§ —")).toBe("");
  });
});

describe("normalizeSuggestedTemplateProperties", () => {
  it("assigns keys, ids and order", () => {
    const out = normalizeSuggestedTemplateProperties(
      [
        { label: "Paragraph", type: "text" },
        { label: "In force since", type: "date" },
      ],
      ids()
    );
    expect(out.map((p) => p.key)).toEqual(["paragraph", "in-force-since"]);
    expect(out.map((p) => p.order)).toEqual([0, 1]);
    expect(out.map((p) => p.id)).toEqual(["id-1", "id-2"]);
  });

  it("disambiguates a repeated key rather than overwriting", () => {
    const out = normalizeSuggestedTemplateProperties(
      [
        { label: "Status", type: "text" },
        { label: "status", type: "text" },
        { label: "STATUS", type: "text" },
      ],
      ids()
    );
    expect(out.map((p) => p.key)).toEqual(["status", "status-2", "status-3"]);
  });

  it("drops a property whose label yields no key", () => {
    const out = normalizeSuggestedTemplateProperties(
      [
        { label: "§§", type: "text" },
        { label: "Title", type: "text" },
      ],
      ids()
    );
    expect(out.map((p) => p.label)).toEqual(["Title"]);
    expect(out[0]?.order).toBe(0);
  });

  it("keeps options only for select properties", () => {
    const out = normalizeSuggestedTemplateProperties(
      [
        { label: "Kind", options: ["a", "b"], type: "select" },
        { label: "Note", options: ["x"], type: "text" },
      ],
      ids()
    );
    expect(out[0]?.options).toEqual(["a", "b"]);
    expect(out[1]?.options).toBeUndefined();
  });

  it("marks only the first few properties as compact", () => {
    const out = normalizeSuggestedTemplateProperties(
      ["A", "B", "C", "D"].map((label) => ({ label, type: "text" as const })),
      ids()
    );
    expect(out.map((p) => p.show_in_compact)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
});
