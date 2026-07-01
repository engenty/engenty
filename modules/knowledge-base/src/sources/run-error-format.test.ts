import { describe, expect, it } from "vitest";
import {
  failureMetadataFromError,
  formatRunError,
  truncateRunError,
} from "./run-error-format.js";

describe("formatRunError", () => {
  it("formats Error with message", () => {
    expect(formatRunError(new Error("boom"))).toBe("boom");
  });

  it("includes cause chain", () => {
    const err = new Error("outer", { cause: new Error("inner") });
    expect(formatRunError(err)).toBe("outer — inner");
  });

  it("formats AggregateError child messages", () => {
    const err = new AggregateError([new Error("a"), new Error("b")], "ignored");
    expect(formatRunError(err)).toBe("a; b");
  });

  it("stringifies unknown objects", () => {
    expect(formatRunError({ code: 1 })).toBe('{"code":1}');
  });
});

describe("truncateRunError", () => {
  it("leaves short messages intact", () => {
    expect(truncateRunError("x")).toBe("x");
  });

  it("truncates long messages", () => {
    const long = "a".repeat(20_000);
    const out = truncateRunError(long);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(12_000 + 1);
  });
});

describe("failureMetadataFromError", () => {
  it("records error name", () => {
    expect(failureMetadataFromError(new TypeError("x"))).toEqual({
      error_name: "TypeError",
    });
  });

  it("records aggregate count", () => {
    const err = new AggregateError([new Error("a")], "x");
    expect(failureMetadataFromError(err)).toMatchObject({
      aggregate_error_count: 1,
      error_name: "AggregateError",
    });
  });
});
