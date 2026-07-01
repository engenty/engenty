import { describe, expect, it } from "vitest";
import { buildAgenticIngestInstructionBlock } from "./source-agentic-ingest-options.js";

describe("buildAgenticIngestInstructionBlock", () => {
  it("serializes trimmed agentic ingestion instructions", () => {
    expect(
      buildAgenticIngestInstructionBlock({
        instructions: "  Build topic pages and preserve official citations.  ",
      })
    ).toBe(
      [
        "Agentic ingestion instructions:",
        "Build topic pages and preserve official citations.",
      ].join("\n\n")
    );
  });

  it("keeps a stable heading when instructions are empty", () => {
    expect(buildAgenticIngestInstructionBlock({ instructions: "   " })).toBe(
      "Agentic ingestion instructions:"
    );
  });
});
