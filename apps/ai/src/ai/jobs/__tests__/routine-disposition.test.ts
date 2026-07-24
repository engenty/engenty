import { describe, expect, it } from "vitest";
import { parseRoutineDisposition } from "../routine-disposition.js";

describe("parseRoutineDisposition", () => {
  it("token-only ROUTINE_OK → quiet with empty report", () => {
    expect(parseRoutineDisposition("ROUTINE_OK")).toEqual({
      cleanedText: "",
      disposition: "quiet",
    });
  });

  it("token + text (trailing OK) → report, token stripped", () => {
    expect(parseRoutineDisposition("Checked inbox.\nROUTINE_OK")).toEqual({
      cleanedText: "Checked inbox.",
      disposition: "report",
    });
  });

  it("leading OK + body → report, token stripped", () => {
    expect(parseRoutineDisposition("ROUTINE_OK\nChecked inbox.")).toEqual({
      cleanedText: "Checked inbox.",
      disposition: "report",
    });
  });

  it("text + trailing ROUTINE_REVIEW → review with reason", () => {
    const result = parseRoutineDisposition(
      "Found a stuck task.\nROUTINE_REVIEW: ENG-12 needs a human"
    );
    expect(result.disposition).toBe("review");
    expect(result.cleanedText).toContain("Found a stuck task.");
    expect(result.reviewReason).toBe("ENG-12 needs a human");
  });

  it("mid-text token → report, token left in place", () => {
    expect(
      parseRoutineDisposition("Said ROUTINE_OK mid-sentence and continued.")
    ).toEqual({
      cleanedText: "Said ROUTINE_OK mid-sentence and continued.",
      disposition: "report",
    });
  });

  it("no token → report", () => {
    expect(parseRoutineDisposition("Reaped 2 checkouts.")).toEqual({
      cleanedText: "Reaped 2 checkouts.",
      disposition: "report",
    });
  });

  it("ROUTINE_REVIEW alone with reason", () => {
    expect(parseRoutineDisposition("ROUTINE_REVIEW: look at ENG-9")).toEqual({
      cleanedText: "look at ENG-9",
      disposition: "review",
      reviewReason: "look at ENG-9",
    });
  });
});
