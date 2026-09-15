import { describe, expect, it } from "vitest";
import {
  DESK_REPLY_PREVIEW_CHARS,
  previewReplyText,
} from "../desk-reply-preview.js";

describe("previewReplyText", () => {
  it("keeps a short reply whole, flattened to one line", () => {
    expect(previewReplyText("Done.\n\nTwo rows written.")).toBe(
      "Done. Two rows written."
    );
  });

  it("cuts a long reply at a word and marks the cut", () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const preview = previewReplyText(words);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(DESK_REPLY_PREVIEW_CHARS + 1);
    expect(preview.slice(0, -1).endsWith(" ")).toBe(false);
    expect(
      preview
        .slice(0, -1)
        .split(" ")
        .every((w) => /^word\d+$/.test(w))
    ).toBe(true);
  });
});
