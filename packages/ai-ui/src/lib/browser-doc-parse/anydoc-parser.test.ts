import { describe, expect, it } from "vitest";
import { anydocFormatFor } from "./anydoc-parser.js";

describe("anydocFormatFor", () => {
  it("maps PDF mime and office extensions", () => {
    expect(anydocFormatFor("application/pdf", "x.bin")).toBe("pdf");
    expect(
      anydocFormatFor(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "memo.docx"
      )
    ).toBe("docx");
    expect(anydocFormatFor("application/octet-stream", "slides.pptx")).toBe(
      "pptx"
    );
    expect(anydocFormatFor("image/png", "photo.png")).toBeNull();
  });
});
