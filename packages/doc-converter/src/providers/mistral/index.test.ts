import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MistralOcrProvider } from "./index.js";

const fetchMock = vi.fn();

describe("MistralOcrProvider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "mistral-ocr-latest",
          pages: [
            { index: 0, markdown: "# Title" },
            { index: 1, markdown: "Second page." },
          ],
          usage_info: { pages_processed: 2 },
        }),
        { status: 200 }
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a base64 document_url for PDFs and joins page markdown", async () => {
    const p = new MistralOcrProvider({ apiKey: "sk-test" });
    const data = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const r = await p.convert(data, "doc.pdf", "application/pdf");

    expect(r.markdown).toBe("# Title\n\nSecond page.");
    expect(r.metadata.page_count).toBe(2);
    expect(r.metadata.word_count).toBeGreaterThan(0);
    expect(r.source.filename).toBe("doc.pdf");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mistral.ai/v1/ocr");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test"
    );
    const body = JSON.parse(String(init.body)) as {
      model: string;
      document: { type: string; document_url?: string };
    };
    expect(body.model).toBe("mistral-ocr-latest");
    expect(body.document.type).toBe("document_url");
    expect(body.document.document_url).toBe(
      `data:application/pdf;base64,${Buffer.from(data).toString("base64")}`
    );
  });

  it("sends images as image_url and honors a custom model", async () => {
    const p = new MistralOcrProvider({
      apiKey: "sk-test",
      model: "mistral-ocr-4-0",
    });
    const data = new Uint8Array([0xff, 0xd8, 0xff]);
    await p.convert(data, "scan.jpg", "image/jpeg");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      model: string;
      document: { type: string; image_url?: string };
    };
    expect(body.model).toBe("mistral-ocr-4-0");
    expect(body.document.type).toBe("image_url");
    expect(body.document.image_url?.startsWith("data:image/jpeg;base64,")).toBe(
      true
    );
  });

  it("throws with status and body on API errors", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })
    );
    const p = new MistralOcrProvider({ apiKey: "bad" });
    await expect(
      p.convert(new Uint8Array([1]), "doc.pdf", "application/pdf")
    ).rejects.toThrow(/Mistral OCR request failed \(401\)/);
  });

  it("only accepts supported MIME types", () => {
    const p = new MistralOcrProvider({ apiKey: "sk-test" });
    expect(p.canConvert("application/pdf")).toBe(true);
    expect(p.canConvert("image/png")).toBe(true);
    expect(p.canConvert("text/html")).toBe(false);
  });
});
