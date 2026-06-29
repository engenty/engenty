import { describe, expect, it } from "vitest";
import {
  FILE_STORAGE_OFFICE_PDF_PREVIEW_MIME_TYPES,
  isFileStorageOfficePdfPreviewMime,
  isFileStorageThumbnailSourceMime,
} from "./office-preview-mime.js";

describe("office-preview-mime", () => {
  it("includes common office MIME types", () => {
    expect(
      FILE_STORAGE_OFFICE_PDF_PREVIEW_MIME_TYPES.has(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(true);
    expect(
      isFileStorageOfficePdfPreviewMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(true);
    expect(isFileStorageOfficePdfPreviewMime("application/pdf")).toBe(false);
  });

  it("marks PDF and office types as thumbnail sources", () => {
    expect(isFileStorageThumbnailSourceMime("application/pdf")).toBe(true);
    expect(
      isFileStorageThumbnailSourceMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(true);
    expect(isFileStorageThumbnailSourceMime("image/png")).toBe(false);
  });
});
