import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlamaParseProvider } from "./index.js";

const create = vi.fn();
const waitForCompletion = vi.fn();

vi.mock("@llamaindex/llama-cloud", () => ({
  default: class MockLlamaCloud {
    parsing = { create, waitForCompletion };
  },
}));

describe("LlamaParseProvider", () => {
  beforeEach(() => {
    create.mockReset();
    waitForCompletion.mockReset();
    create.mockResolvedValue({ id: "job-1" });
    waitForCompletion.mockResolvedValue({
      job: { id: "job-1", status: "COMPLETED" },
      markdown_full: "# Parsed\n\nBody",
    });
  });

  it("returns markdown from LlamaParse result", async () => {
    const p = new LlamaParseProvider({ apiKey: "test-key" });
    const data = new Uint8Array([1, 2, 3]);
    const r = await p.convert(data, "doc.pdf", "application/pdf");
    expect(r.markdown).toBe("# Parsed\n\nBody");
    expect(r.source.filename).toBe("doc.pdf");
    expect(create).toHaveBeenCalledTimes(1);
    expect(waitForCompletion).toHaveBeenCalledWith(
      "job-1",
      {
        expand: [
          "markdown",
          "text",
          "items",
          "markdown_content_metadata",
          "text_content_metadata",
        ],
      },
      expect.objectContaining({ timeout: 120_000 })
    );
  });
});
