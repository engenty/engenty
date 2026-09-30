import { describe, expect, it } from "vitest";
import {
  detectToolOutputError,
  extractProseSnippet,
} from "./tool-call-card-utils";

// An output-present tool can still carry an error payload; the timeline must
// show an error step, not a green check.
describe("detectToolOutputError", () => {
  it("reads a top-level Zod issue array", () => {
    expect(
      detectToolOutputError([
        {
          expected: "string",
          code: "invalid_type",
          path: ["inbox_id"],
          message: "Invalid input: expected string, received undefined",
        },
      ])
    ).toBe("Invalid input: expected string, received undefined");
  });

  it("reads issues nested under errors/issues and ok:false", () => {
    expect(
      detectToolOutputError({
        issues: [{ code: "custom", path: [], message: "bad" }],
      })
    ).toBe("bad");
    expect(detectToolOutputError({ ok: false, error: "boom" })).toBe("boom");
  });

  it("returns null for normal output", () => {
    expect(
      detectToolOutputError({ total: 4, results: [{ id: "x" }] })
    ).toBeNull();
    expect(detectToolOutputError([{ id: "x", title: "ok" }])).toBeNull();
  });
});

// A workspace file read is tool output, not prose: it must never become the
// always-visible timeline snippet.
describe("file-read dump never reaches the timeline snippet", () => {
  const DUMP =
    'cli-runs/run-001/time_tracking_plan.json (224634 bytes)\n 1->{\n 2->  "generated_at": "2026-08-08",';

  it("rejects the dump as prose", () => {
    expect(extractProseSnippet(DUMP)).toBeNull();
  });

  it("rejects it under a prose key too", () => {
    expect(extractProseSnippet({ content: DUMP })).toBeNull();
    expect(extractProseSnippet({ data: { stdout: DUMP } })).toBeNull();
  });

  it.each([
    ["ASCII arrow lines", " 1->hello there\n 2->more text"],
    ["ligature arrow lines", " 1→hello there\n 2→more text"],
    ["bare header", "notes/plan.json (224634 bytes)"],
  ])("rejects the %s shape", (_shape, dump) => {
    expect(extractProseSnippet(dump)).toBeNull();
  });

  it("still lets genuine prose through", () => {
    expect(
      extractProseSnippet("Created 3 team members in the workspace.")
    ).toBe("Created 3 team members in the workspace.");
    // Prose that merely mentions bytes is not a dump.
    expect(
      extractProseSnippet("The upload finished and the file is 224634 bytes.")
    ).toContain("224634");
  });
});
