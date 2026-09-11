import { describe, expect, it } from "vitest";
import {
  isFileStorageCsvMime,
  isFileStorageMarkdownMime,
  isFileStoragePdfMime,
  isFileStorageSpreadsheetMime,
  isFileStorageTextPreviewMime,
  resolveFileStoragePreviewMime,
} from "./text-preview-mime.js";

describe("text-preview-mime", () => {
  it("treats CSV, text, markdown and JSON as previewable", () => {
    expect(isFileStorageTextPreviewMime("text/csv")).toBe(true);
    expect(isFileStorageTextPreviewMime("text/plain")).toBe(true);
    expect(isFileStorageTextPreviewMime("text/markdown")).toBe(true);
    expect(isFileStorageTextPreviewMime("application/json")).toBe(true);
    // any text/* subtype
    expect(isFileStorageTextPreviewMime("text/x-log")).toBe(true);
  });

  it("recognises PDFs by mime or by .pdf name", () => {
    expect(isFileStoragePdfMime("application/pdf")).toBe(true);
    expect(isFileStoragePdfMime("APPLICATION/PDF")).toBe(true);
    expect(isFileStoragePdfMime("application/octet-stream", "letter.pdf")).toBe(
      true
    );
    expect(isFileStoragePdfMime("application/octet-stream", "letter.PDF")).toBe(
      true
    );
    expect(isFileStoragePdfMime("application/octet-stream", "notes.txt")).toBe(
      false
    );
  });

  it("guesses a preview mime when the listing sent octet-stream or nothing", () => {
    expect(resolveFileStoragePreviewMime("application/pdf")).toBe(
      "application/pdf"
    );
    expect(
      resolveFileStoragePreviewMime("application/octet-stream", "letter.pdf")
    ).toBe("application/pdf");
    expect(resolveFileStoragePreviewMime("", "photo.png")).toBe("image/png");
  });

  it("does not treat binary/office types as text previewable", () => {
    expect(isFileStorageTextPreviewMime("application/pdf")).toBe(false);
    expect(isFileStorageTextPreviewMime("image/png")).toBe(false);
    expect(
      isFileStorageTextPreviewMime(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).toBe(false);
  });

  it("identifies CSV/TSV and markdown subtypes", () => {
    expect(isFileStorageCsvMime("text/csv")).toBe(true);
    expect(isFileStorageCsvMime("text/tab-separated-values")).toBe(true);
    expect(isFileStorageCsvMime("text/plain")).toBe(false);
    expect(isFileStorageMarkdownMime("text/markdown")).toBe(true);
    expect(isFileStorageMarkdownMime("text/plain")).toBe(false);
  });

  describe("spreadsheets", () => {
    it("recognises the OOXML workbook types", () => {
      expect(
        isFileStorageSpreadsheetMime(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
      ).toBe(true);
      expect(
        isFileStorageSpreadsheetMime(
          "application/vnd.ms-excel.sheet.macroEnabled.12"
        )
      ).toBe(true);
    });

    it("falls back to the NAME, because uploads arrive as octet-stream", () => {
      expect(
        isFileStorageSpreadsheetMime("application/octet-stream", "budget.xlsx")
      ).toBe(true);
      expect(
        isFileStorageSpreadsheetMime("application/octet-stream", "MACROS.XLSM")
      ).toBe(true);
      expect(
        isFileStorageSpreadsheetMime("application/octet-stream", "notes.txt")
      ).toBe(false);
      expect(isFileStorageSpreadsheetMime("application/octet-stream")).toBe(
        false
      );
    });

    it("refuses legacy .xls — a different container the reader cannot open", () => {
      expect(isFileStorageSpreadsheetMime("application/vnd.ms-excel")).toBe(
        false
      );
      expect(
        isFileStorageSpreadsheetMime("application/octet-stream", "old.xls")
      ).toBe(false);
    });

    it("stays out of the text-preview path", () => {
      expect(
        isFileStorageTextPreviewMime(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
      ).toBe(false);
    });
  });
});
