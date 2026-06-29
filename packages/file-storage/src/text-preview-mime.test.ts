import { describe, expect, it } from "vitest";
import {
  isFileStorageCsvMime,
  isFileStorageMarkdownMime,
  isFileStorageTextPreviewMime,
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
});
