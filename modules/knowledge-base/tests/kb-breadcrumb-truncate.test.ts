import { describe, expect, it } from "vitest";
import {
  KB_BREADCRUMB_SEGMENT_MAX_CHARS,
  truncateKbBreadcrumbSegment,
} from "../ui/lib/kb-breadcrumb-truncate.js";

describe("truncateKbBreadcrumbSegment", () => {
  it("returns short strings unchanged without tooltip", () => {
    const s = "Short title";
    expect(truncateKbBreadcrumbSegment(s)).toEqual({
      label: "Short title",
    });
  });

  it("truncates long strings and sets tooltip", () => {
    const long = "a".repeat(KB_BREADCRUMB_SEGMENT_MAX_CHARS + 10);
    const out = truncateKbBreadcrumbSegment(long);
    expect(out.tooltip).toBe(long);
    expect(out.label.length).toBeLessThanOrEqual(
      KB_BREADCRUMB_SEGMENT_MAX_CHARS
    );
    expect(out.label.endsWith("\u2026")).toBe(true);
  });

  it("respects custom max length", () => {
    expect(truncateKbBreadcrumbSegment("hello world", 5)).toEqual({
      label: "hell\u2026",
      tooltip: "hello world",
    });
  });
});
