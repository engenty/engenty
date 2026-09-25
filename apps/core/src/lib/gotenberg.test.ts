import { afterEach, describe, expect, it, vi } from "vitest";
import { convertOfficeToPdf } from "./gotenberg.js";

describe("gotenberg", () => {
  const saved = process.env.GOTENBERG_URL;

  afterEach(() => {
    process.env.GOTENBERG_URL = saved;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("convertOfficeToPdf posts to libreoffice convert with trimmed base URL", async () => {
    process.env.GOTENBERG_URL = "http://127.0.0.1:3999///";
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => pdfBytes.buffer,
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await convertOfficeToPdf(new Uint8Array([1, 2, 3]), "a.docx");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3999/forms/libreoffice/convert",
      expect.objectContaining({ method: "POST" })
    );
    const reqInit = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(reqInit.body).toBeInstanceOf(FormData);
    expect(out).toEqual(pdfBytes);
  });

  it("convertOfficeToPdf throws when response not ok", async () => {
    process.env.GOTENBERG_URL = "http://127.0.0.1:3999";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "boom",
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    );

    await expect(
      convertOfficeToPdf(new Uint8Array([1]), "x.docx")
    ).rejects.toThrow();
  });
});
