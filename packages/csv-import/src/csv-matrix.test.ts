import { describe, expect, it } from "vitest";
import {
  appendCsvColumn,
  appendCsvRow,
  clearCsvRange,
  csvRange,
  csvRangeContains,
  csvRangeToText,
  parseCsvBlock,
  parseCsvMatrix,
  removeCsvColumn,
  removeCsvRow,
  serializeCsvMatrix,
  setCsvCell,
  setCsvColumnName,
  writeCsvBlock,
} from "./csv-matrix.js";

describe("parseCsvMatrix", () => {
  it("splits a header from its rows", () => {
    const matrix = parseCsvMatrix("name,email\nAda,ada@example.com\n");
    expect(matrix.columns).toEqual(["name", "email"]);
    expect(matrix.rows).toEqual([["Ada", "ada@example.com"]]);
    expect(matrix.delimiter).toBe(",");
  });

  it("keeps a quoted delimiter inside the cell, not as a new column", () => {
    const matrix = parseCsvMatrix('company,contact\n"Acme, Inc.",Ada\n');
    expect(matrix.rows[0]).toEqual(["Acme, Inc.", "Ada"]);
  });

  it("remembers a semicolon file is a semicolon file", () => {
    const matrix = parseCsvMatrix("name;city\nMax;Wien\n");
    expect(matrix.delimiter).toBe(";");
    expect(serializeCsvMatrix(matrix)).toBe("name;city\nMax;Wien\n");
  });

  it("pads a short row so every cell has an address", () => {
    const matrix = parseCsvMatrix("a,b,c\n1,2\n");
    expect(matrix.rows[0]).toEqual(["1", "2", ""]);
    expect(matrix.raggedRows).toBe(0);
  });

  it("KEEPS cells a narrow header would have dropped, and says how many", () => {
    // The header names two columns; the row carries three. Serializing against
    // the narrow header would lose the third on the next save.
    const matrix = parseCsvMatrix("a,b\n1,2,3\n");
    expect(matrix.columns).toEqual(["a", "b", ""]);
    expect(matrix.rows[0]).toEqual(["1", "2", "3"]);
    expect(matrix.raggedRows).toBe(1);
    expect(serializeCsvMatrix(matrix)).toContain("1,2,3");
  });

  it("answers an empty matrix for empty or blank text rather than throwing", () => {
    expect(parseCsvMatrix("").rows).toEqual([]);
    expect(parseCsvMatrix("   \n ").columns).toEqual([]);
  });
});

describe("round-trip", () => {
  it("re-quotes a cell that needs it", () => {
    const source = 'name,note\nAda,"said ""hi"", then left"\n';
    const matrix = parseCsvMatrix(source);
    expect(matrix.rows[0][1]).toBe('said "hi", then left');
    expect(serializeCsvMatrix(matrix)).toBe(source);
  });

  it("serializes an empty matrix to nothing, not to a stray newline", () => {
    expect(serializeCsvMatrix(parseCsvMatrix(""))).toBe("");
  });
});

describe("editing", () => {
  const base = parseCsvMatrix(
    "name,email\nAda,ada@example.com\nGrace,g@x.io\n"
  );

  it("sets one cell and leaves the others alone", () => {
    const next = setCsvCell(base, 0, 1, "ada@lovelace.dev");
    expect(next.rows[0]).toEqual(["Ada", "ada@lovelace.dev"]);
    expect(next.rows[1]).toEqual(base.rows[1]);
    expect(base.rows[0][1]).toBe("ada@example.com");
  });

  it("renames a column without touching the rows", () => {
    expect(setCsvColumnName(base, 1, "mail").columns).toEqual(["name", "mail"]);
  });

  it("appends a row as wide as the header", () => {
    const next = appendCsvRow(base);
    expect(next.rows).toHaveLength(3);
    expect(next.rows[2]).toEqual(["", ""]);
  });

  it("gives a matrix with no columns one when a row is added", () => {
    const next = appendCsvRow(parseCsvMatrix(""));
    expect(next.columns).toHaveLength(1);
    expect(next.rows[0]).toEqual([""]);
  });

  it("removes a row", () => {
    expect(removeCsvRow(base, 0).rows).toEqual([["Grace", "g@x.io"]]);
  });

  it("appends a column to the header AND to every row", () => {
    const next = appendCsvColumn(base, "phone");
    expect(next.columns).toEqual(["name", "email", "phone"]);
    expect(next.rows.every((row) => row.length === 3)).toBe(true);
  });

  it("removes a column from the header AND from every row", () => {
    const next = removeCsvColumn(base, 0);
    expect(next.columns).toEqual(["email"]);
    expect(next.rows).toEqual([["ada@example.com"], ["g@x.io"]]);
  });

  it("round-trips an edit back to text", () => {
    const next = setCsvCell(appendCsvColumn(base, "city"), 1, 2, "Wien");
    expect(serializeCsvMatrix(next)).toBe(
      "name,email,city\nAda,ada@example.com,\nGrace,g@x.io,Wien\n"
    );
  });
});

describe("selection ranges", () => {
  const base = parseCsvMatrix("a,b,c\n1,2,3\n4,5,6\n7,8,9\n");

  it("normalizes a rectangle dragged in any direction", () => {
    const downRight = csvRange({ column: 0, row: 0 }, { column: 2, row: 2 });
    const upLeft = csvRange({ column: 2, row: 2 }, { column: 0, row: 0 });
    expect(downRight).toEqual(upLeft);
    expect(downRight).toEqual({ bottom: 2, left: 0, right: 2, top: 0 });
  });

  it("knows which cells it contains", () => {
    const range = csvRange({ column: 1, row: 0 }, { column: 2, row: 1 });
    expect(csvRangeContains(range, { column: 1, row: 1 })).toBe(true);
    expect(csvRangeContains(range, { column: 0, row: 1 })).toBe(false);
  });

  it("copies a selection as TAB-separated text, which is what sheets paste back", () => {
    const text = csvRangeToText(
      base,
      csvRange({ column: 0, row: 0 }, { column: 1, row: 1 })
    );
    expect(text).toBe("1\t2\n4\t5");
  });

  it("copies the header when the selection reaches into it", () => {
    const text = csvRangeToText(
      base,
      csvRange({ column: 0, row: -1 }, { column: 1, row: 0 })
    );
    expect(text).toBe("a\tb\n1\t2");
  });

  it("clears a rectangle without removing rows or columns", () => {
    const next = clearCsvRange(
      base,
      csvRange({ column: 1, row: 0 }, { column: 2, row: 1 })
    );
    expect(next.rows[0]).toEqual(["1", "", ""]);
    expect(next.rows[2]).toEqual(["7", "8", "9"]);
    expect(next.columns).toEqual(["a", "b", "c"]);
  });
});

describe("clipboard blocks", () => {
  it("reads tab-separated text as cells", () => {
    expect(parseCsvBlock("1\t2\n3\t4")).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("falls back to CSV when there is no tab", () => {
    expect(parseCsvBlock("1,2\n3,4")).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("GROWS the matrix rather than dropping what does not fit", () => {
    // Two columns and one row in; a 3x2 block pasted at the last cell must not
    // stop at the edge — pasting 3 rows means you wanted 3 rows.
    const small = parseCsvMatrix("a,b\n1,2\n");
    const next = writeCsvBlock(small, { column: 1, row: 0 }, [
      ["x", "y"],
      ["z", "w"],
    ]);
    expect(next.columns).toHaveLength(3);
    expect(next.rows).toEqual([
      ["1", "x", "y"],
      ["", "z", "w"],
    ]);
  });

  it("pastes into the header when the target row is the header", () => {
    const next = writeCsvBlock(
      parseCsvMatrix("a,b\n1,2\n"),
      {
        column: 0,
        row: -1,
      },
      [["name", "value"]]
    );
    expect(next.columns).toEqual(["name", "value"]);
    expect(next.rows).toEqual([["1", "2"]]);
  });
});
