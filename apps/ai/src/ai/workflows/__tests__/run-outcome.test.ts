import { describe, expect, it } from "vitest";
import { extractRunContractFields } from "../run-outcome.js";

describe("extractRunContractFields", () => {
  it("reads both fields off an object result", () => {
    expect(
      extractRunContractFields({
        outcome: "partial",
        reporting: "verbose",
        summary: "3 of 5 imported",
      })
    ).toEqual({ outcome: "partial", reporting: "verbose" });
  });

  it("returns nulls for a prose result — the pre-contract world stays legal", () => {
    expect(extractRunContractFields("all done")).toEqual({
      outcome: null,
      reporting: null,
    });
    expect(extractRunContractFields(undefined)).toEqual({
      outcome: null,
      reporting: null,
    });
  });

  it("drops an invalid value instead of throwing, and names it", () => {
    // A model misspelling "partial" must not turn a completed run into a
    // failed one — the caller logs `invalid` and the column stays null.
    const fields = extractRunContractFields({
      outcome: "partail",
      reporting: "loud",
    });
    expect(fields.outcome).toBeNull();
    expect(fields.reporting).toBeNull();
    expect(fields.invalid).toEqual({ outcome: "partail", reporting: "loud" });
  });

  it("accepts every documented value on both planes", () => {
    for (const outcome of [
      "ok",
      "nothing_to_do",
      "partial",
      "needs_attention",
      "rejected",
      "failed",
    ]) {
      expect(extractRunContractFields({ outcome }).outcome).toBe(outcome);
    }
    for (const reporting of ["silent", "info", "verbose"]) {
      expect(extractRunContractFields({ reporting }).reporting).toBe(reporting);
    }
  });
});
