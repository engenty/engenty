import { describe, expect, it } from "vitest";
import {
  normalizeListRecordsPayload,
  recordsToDelimitedText,
} from "./records-to-csv.js";

describe("recordsToDelimitedText", () => {
  it("builds a TSV with stable header order from first-seen keys", () => {
    const text = recordsToDelimitedText([
      { email: "a@x.com", name: "Ada" },
      { name: "Bob", phone: "1" },
    ]);
    expect(text).toBe(
      ["email\tname\tphone", "a@x.com\tAda\t", "\tBob\t1"].join("\n")
    );
  });

  it("escapes delimiters and quotes", () => {
    const text = recordsToDelimitedText(
      [{ name: 'Say "hi"', note: "a\tb" }],
      "\t"
    );
    expect(text.split("\n")[1]).toContain('"Say ""hi"""');
    expect(text.split("\n")[1]).toContain('"a\tb"');
  });

  it("throws on empty input", () => {
    expect(() => recordsToDelimitedText([])).toThrow(/No records/);
  });
});

describe("normalizeListRecordsPayload", () => {
  it("reads contacts arrays and stringifies scalars", () => {
    const rows = normalizeListRecordsPayload({
      contacts: [
        { display_name: "Ada", email: "a@x.com", score: 1, active: true },
        { display_name: null, email: "b@x.com" },
      ],
    });
    expect(rows).toEqual([
      { display_name: "Ada", email: "a@x.com", score: "1", active: "true" },
      { display_name: "", email: "b@x.com" },
    ]);
  });
});
