import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  columnLetter,
  isXlsxSheetTruncated,
  readXlsxWorkbook,
  XLSX_MAX_COLUMNS,
  XLSX_MAX_ROWS,
  xlsxCellText,
} from "./xlsx-workbook.js";

/** Round-trips through real .xlsx bytes rather than a hand-built fake. */
async function bytesOf(
  build: (workbook: ExcelJS.Workbook) => void
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("columnLetter", () => {
  it("counts the way a spreadsheet does", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(51)).toBe("AZ");
    expect(columnLetter(52)).toBe("BA");
    expect(columnLetter(701)).toBe("ZZ");
    expect(columnLetter(702)).toBe("AAA");
  });
});

describe("xlsxCellText", () => {
  it("renders the plain types", () => {
    expect(xlsxCellText(null)).toBe("");
    expect(xlsxCellText("Ada")).toBe("Ada");
    expect(xlsxCellText(4.5)).toBe("4.5");
    expect(xlsxCellText(true)).toBe("TRUE");
    expect(xlsxCellText(false)).toBe("FALSE");
  });

  it("shows a date without a time, and with one when there is one", () => {
    expect(xlsxCellText(new Date("2026-03-04T00:00:00Z"))).toBe("2026-03-04");
    expect(xlsxCellText(new Date("2026-03-05T09:30:00Z"))).toBe(
      "2026-03-05 09:30"
    );
  });

  it("prefers a formula's cached result — that is what Excel displays", () => {
    expect(xlsxCellText({ formula: "B2*C2", result: 13.5 })).toBe("13.5");
  });

  it("falls back to the FORMULA when nothing computed it", () => {
    // A blank here would claim the sheet is empty where it is only uncomputed.
    expect(xlsxCellText({ formula: "B3*C3" })).toBe("=B3*C3");
  });

  it("surfaces an error result rather than swallowing it", () => {
    expect(xlsxCellText({ error: "#DIV/0!" })).toBe("#DIV/0!");
    expect(
      xlsxCellText({ formula: "A1/0", result: { error: "#DIV/0!" } })
    ).toBe("#DIV/0!");
  });

  it("joins rich-text runs into the text the cell reads as", () => {
    expect(
      xlsxCellText({
        richText: [{ text: "rich " }, { font: { bold: true }, text: "text" }],
      })
    ).toBe("rich text");
  });

  it("shows a hyperlink's label, not its target", () => {
    expect(
      xlsxCellText({ hyperlink: "https://engenty.com", text: "engenty" })
    ).toBe("engenty");
  });
});

describe("readXlsxWorkbook", () => {
  it("reads every sheet, keyed by spreadsheet letters rather than a header", async () => {
    const bytes = await bytesOf((workbook) => {
      const sheet = workbook.addWorksheet("Numbers");
      sheet.addRow(["name", "qty"]);
      sheet.addRow(["Widget", 3]);
      workbook.addWorksheet("Second");
    });

    const { sheets } = await readXlsxWorkbook(bytes);
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Numbers", "Second"]);

    const [first] = sheets;
    expect(first?.matrix.columns).toEqual(["A", "B"]);
    // Row 1 stays row 1 — a worksheet does not promise a header row.
    expect(first?.matrix.rows).toEqual([
      ["name", "qty"],
      ["Widget", "3"],
    ]);
  });

  it("keeps a merged value in its master cell ONLY", async () => {
    // exceljs repeats the master's value in every covered cell; written out
    // as-is, one banner would become three.
    const bytes = await bytesOf((workbook) => {
      const sheet = workbook.addWorksheet("Merged");
      sheet.getCell("A1").value = "banner";
      sheet.mergeCells("A1:C1");
      sheet.getCell("A2").value = "after";
    });

    const { sheets } = await readXlsxWorkbook(bytes);
    expect(sheets[0]?.matrix.rows[0]).toEqual(["banner", "", ""]);
    expect(sheets[0]?.matrix.rows[1]?.[0]).toBe("after");
  });

  it("holds a sparse sheet's cells at their own addresses", async () => {
    const bytes = await bytesOf((workbook) => {
      const sheet = workbook.addWorksheet("Sparse");
      sheet.getCell("C3").value = "island";
    });

    const { sheets } = await readXlsxWorkbook(bytes);
    const sheet = sheets[0];
    expect(sheet?.matrix.columns).toEqual(["A", "B", "C"]);
    expect(sheet?.matrix.rows).toHaveLength(3);
    // C3 is at row index 2, column index 2 — not pulled up to the first row.
    expect(sheet?.matrix.rows[2]).toEqual(["", "", "island"]);
  });

  it("reads an empty sheet as an empty matrix rather than throwing", async () => {
    const bytes = await bytesOf((workbook) => {
      workbook.addWorksheet("Empty");
    });
    const { sheets } = await readXlsxWorkbook(bytes);
    expect(sheets[0]?.matrix.rows).toEqual([]);
    expect(sheets[0]?.matrix.columns).toEqual([]);
    expect(isXlsxSheetTruncated(sheets[0] as never)).toBe(false);
  });

  it("marks a hidden sheet instead of dropping it", async () => {
    const bytes = await bytesOf((workbook) => {
      workbook.addWorksheet("Shown").getCell("A1").value = "x";
      const hidden = workbook.addWorksheet("Notes");
      hidden.getCell("A1").value = "internal";
      hidden.state = "hidden";
    });

    const { sheets } = await readXlsxWorkbook(bytes);
    expect(sheets.map((sheet) => sheet.hidden)).toEqual([false, true]);
    expect(sheets[1]?.matrix.rows[0]?.[0]).toBe("internal");
  });

  it("caps a huge sheet AND reports that it did", async () => {
    const bytes = await bytesOf((workbook) => {
      const sheet = workbook.addWorksheet("Big");
      for (let row = 0; row < XLSX_MAX_ROWS + 25; row++) {
        sheet.addRow([`row${String(row)}`]);
      }
    });

    const { sheets } = await readXlsxWorkbook(bytes);
    const sheet = sheets[0];
    expect(sheet?.matrix.rows).toHaveLength(XLSX_MAX_ROWS);
    expect(sheet?.sourceRowCount).toBe(XLSX_MAX_ROWS + 25);
    expect(isXlsxSheetTruncated(sheet as never)).toBe(true);
  });

  it("caps width the same way, and says so", async () => {
    const bytes = await bytesOf((workbook) => {
      const sheet = workbook.addWorksheet("Wide");
      sheet.addRow(
        Array.from({ length: XLSX_MAX_COLUMNS + 5 }, (_, index) =>
          String(index)
        )
      );
    });

    const { sheets } = await readXlsxWorkbook(bytes);
    const sheet = sheets[0];
    expect(sheet?.matrix.columns).toHaveLength(XLSX_MAX_COLUMNS);
    expect(sheet?.sourceColumnCount).toBe(XLSX_MAX_COLUMNS + 5);
    expect(isXlsxSheetTruncated(sheet as never)).toBe(true);
  });

  it("rejects bytes that are not a workbook", async () => {
    await expect(
      readXlsxWorkbook(new TextEncoder().encode("name,email\nAda,a@x.io\n"))
    ).rejects.toThrow();
  });
});
