import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "./index.js";

const generateText = vi.fn();

vi.mock("ai", () => ({
  generateText,
}));

describe("GeminiProvider", () => {
  beforeEach(() => {
    generateText.mockReset();
    generateText.mockResolvedValue({ text: "# Title\n\nParagraph." });
  });

  it("calls generateText and returns markdown", async () => {
    const p = new GeminiProvider({ model: "google/gemini-2.5-flash" });
    const data = new Uint8Array([0xff, 0xd8, 0xff]);
    const r = await p.convert(data, "scan.jpg", "image/jpeg");
    expect(r.markdown).toBe("# Title\n\nParagraph.");
    expect(r.metadata.word_count).toBeGreaterThan(0);
    expect(generateText).toHaveBeenCalledTimes(1);
    const call = generateText.mock.calls[0]?.[0] as {
      model?: string;
      messages?: unknown[];
    };
    expect(call?.model).toBe("google/gemini-2.5-flash");
    expect(Array.isArray(call?.messages)).toBe(true);
  });
});
