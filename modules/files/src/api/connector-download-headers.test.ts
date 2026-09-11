import { describe, expect, it } from "vitest";
import { connectorDownloadHeaders } from "./connector-download-headers.js";

describe("connectorDownloadHeaders", () => {
  it("serves a PDF inline so the browser viewer can render it", () => {
    expect(
      connectorDownloadHeaders({
        filename: "letter.pdf",
        mimeType: null,
      })
    ).toEqual({
      "content-disposition": 'inline; filename="letter.pdf"',
      "content-type": "application/pdf",
    });
  });

  it("keeps a provider mime when one was sent", () => {
    expect(
      connectorDownloadHeaders({
        filename: "shot.bin",
        mimeType: "image/png",
      })
    ).toEqual({
      "content-disposition": 'inline; filename="shot.bin"',
      "content-type": "image/png",
    });
  });

  it("downloads unknown binaries as attachments", () => {
    expect(
      connectorDownloadHeaders({
        filename: "archive.zip",
        mimeType: null,
      })
    ).toEqual({
      "content-disposition": 'attachment; filename="archive.zip"',
      "content-type": "application/octet-stream",
    });
  });
});
