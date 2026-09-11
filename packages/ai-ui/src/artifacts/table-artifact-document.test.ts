import { describe, expect, it } from "vitest";
import {
  parseTableArtifactDocument,
  serializeTableArtifactDocument,
} from "./table-artifact-document.js";

describe("parseTableArtifactDocument", () => {
  it("reads a JSON array of objects as text columns", () => {
    const doc = parseTableArtifactDocument(
      JSON.stringify([
        { name: "Sugar", qty: "4" },
        { name: "Onions", qty: "0" },
      ])
    );
    expect(doc?.kind).toBe("json");
    expect(doc?.columns.map((column) => column.id)).toEqual(["name", "qty"]);
    expect(doc?.rows).toHaveLength(2);
    expect(doc?.rows[0]?.cells.name).toBe("Sugar");
  });

  it("reads CSV and keeps the delimiter on serialize", () => {
    const doc = parseTableArtifactDocument("name;city\nMax;Wien\n");
    expect(doc?.kind).toBe("csv");
    expect(doc?.matrix?.delimiter).toBe(";");
    expect(serializeTableArtifactDocument(doc!)).toBe("name;city\nMax;Wien\n");
  });

  it("round-trips a JSON document through cell edits", () => {
    const doc = parseTableArtifactDocument(
      '[{"Name":"Oranges","Notes":"Out of stock"}]'
    );
    expect(doc).not.toBeNull();
    const next = {
      ...doc!,
      rows: doc!.rows.map((row) => ({
        ...row,
        cells: { ...row.cells, notes: "Plenty" },
      })),
    };
    const serialized = serializeTableArtifactDocument(next);
    expect(JSON.parse(serialized)).toEqual([
      { Name: "Oranges", Notes: "Plenty" },
    ]);
  });

  it("returns null for empty or unparseable content", () => {
    expect(parseTableArtifactDocument("")).toBeNull();
    expect(parseTableArtifactDocument("[]")).toBeNull();
  });
});
