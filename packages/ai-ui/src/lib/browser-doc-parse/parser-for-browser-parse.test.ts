import { describe, expect, it } from "vitest";
import { parserForBrowserParse } from "./parser-for-browser-parse.js";

describe("parserForBrowserParse", () => {
  it("returns null when off", () => {
    expect(parserForBrowserParse("off")).toBeNull();
  });

  it("uses anydoc for the default mode", () => {
    expect(parserForBrowserParse("anydoc")?.id).toBe("anydoc");
  });

  it("uses the liteparse composite for PDFs with anydoc office fallback", () => {
    const parser = parserForBrowserParse("liteparse");
    expect(parser?.id).toBe("liteparse");
    expect(parser?.canParse("application/pdf", "x.pdf")).toBe(true);
    expect(
      parser?.canParse(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "x.docx"
      )
    ).toBe(true);
  });
});
