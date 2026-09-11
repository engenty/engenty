import { describe, expect, it } from "vitest";
import { preserveTrailingNewline } from "./file-text.js";

describe("preserveTrailingNewline", () => {
  it("restores the newline a markdown serializer dropped", () => {
    // The actual bug: `# Küste\n\nprose\n` came back without its final byte,
    // so every save of an untouched-at-the-end file was a diff.
    expect(
      preserveTrailingNewline("# Küste\n\nprose\n", "# Küste\n\nprose")
    ).toBe("# Küste\n\nprose\n");
  });

  it("leaves a file that already ends correctly alone", () => {
    expect(preserveTrailingNewline("a\n", "b\n")).toBe("b\n");
  });

  it("does NOT add one to a file that never had one", () => {
    // A save path, not a formatter — a file that arrived without a final
    // newline did not ask to be changed.
    expect(preserveTrailingNewline("no newline", "edited")).toBe("edited");
  });

  it("never strips extra blank lines — those are content someone typed", () => {
    expect(preserveTrailingNewline("a\n", "b\n\n\n")).toBe("b\n\n\n");
  });

  it("handles an empty original and an emptied file", () => {
    expect(preserveTrailingNewline("", "text")).toBe("text");
    expect(preserveTrailingNewline("a\n", "")).toBe("\n");
  });
});
