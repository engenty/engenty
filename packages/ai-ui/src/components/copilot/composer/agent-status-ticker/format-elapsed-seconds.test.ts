import { describe, expect, it } from "vitest";
import { formatElapsedSeconds } from "./format-elapsed-seconds.js";

describe("formatElapsedSeconds", () => {
  it("formats sub-minute durations in seconds", () => {
    expect(formatElapsedSeconds(0)).toBe("0s");
    expect(formatElapsedSeconds(30)).toBe("30s");
    expect(formatElapsedSeconds(59)).toBe("59s");
  });

  it("formats minutes with and without remainder seconds", () => {
    expect(formatElapsedSeconds(60)).toBe("1m");
    expect(formatElapsedSeconds(65)).toBe("1m 5s");
    expect(formatElapsedSeconds(125)).toBe("2m 5s");
  });

  it("formats hours with and without remainder minutes", () => {
    expect(formatElapsedSeconds(3600)).toBe("1h");
    expect(formatElapsedSeconds(3720)).toBe("1h 2m");
  });

  it("clamps negative and fractional input", () => {
    expect(formatElapsedSeconds(-5)).toBe("0s");
    expect(formatElapsedSeconds(30.9)).toBe("30s");
  });
});
