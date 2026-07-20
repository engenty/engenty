import { describe, expect, it } from "vitest";
import {
  connectionImportSourcesForDomain,
  isImportableConnectionFile,
} from "./import-sources.js";

describe("connectionImportSourcesForDomain", () => {
  it("returns file sources for secrets and team", () => {
    for (const domain of ["secrets", "team"] as const) {
      const ids = connectionImportSourcesForDomain(domain).map(
        (s) => s.connectorId
      );
      expect(ids).toEqual([
        "google-drive",
        "microsoft-onedrive",
        "local-files",
        "s3",
      ]);
    }
  });

  it("includes typed CRM sources for contacts", () => {
    const ids = connectionImportSourcesForDomain("contacts").map(
      (s) => s.connectorId
    );
    expect(ids).toContain("google-contacts");
    expect(ids).toContain("hubspot");
    expect(ids).toContain("google-drive");
  });
});

describe("isImportableConnectionFile", () => {
  it("accepts csv and Google Sheets", () => {
    expect(
      isImportableConnectionFile({
        kind: "file",
        mimeType: "text/csv",
        name: "data.bin",
      })
    ).toBe(true);
    expect(
      isImportableConnectionFile({
        kind: "file",
        mimeType: "application/vnd.google-apps.spreadsheet",
        name: "Sheet",
      })
    ).toBe(true);
    expect(
      isImportableConnectionFile({
        kind: "file",
        mimeType: null,
        name: "export.tsv",
      })
    ).toBe(true);
  });

  it("rejects folders and unrelated files", () => {
    expect(
      isImportableConnectionFile({
        kind: "folder",
        mimeType: null,
        name: "docs",
      })
    ).toBe(false);
    expect(
      isImportableConnectionFile({
        kind: "file",
        mimeType: "application/pdf",
        name: "doc.pdf",
      })
    ).toBe(false);
  });
});
