import { describe, expect, it } from "vitest";

import { stripNul } from "../strip-nul.js";

// Postgres refuses U+0000 in jsonb and text, so one NUL in a tool's output
// failed every later write of that message and aborted the run (seen live
// 2026-09-25 after a background command). Ways the strip can fail: it misses a
// NUL nested in a tool result or in a key, or it changes anything else.
describe("stripNul", () => {
  it("removes U+0000 at any depth and leaves the rest as it was", () => {
    const parts = [
      { text: "ok", type: "text" },
      {
        output: { lines: ["a\u0000b", 3, null, true], "k\u0000": "v" },
        type: "tool-result",
      },
    ];
    expect(stripNul(parts)).toEqual([
      { text: "ok", type: "text" },
      { output: { k: "v", lines: ["ab", 3, null, true] }, type: "tool-result" },
    ]);
    expect(JSON.stringify(stripNul(parts))).not.toContain("\\u0000");
  });
});
