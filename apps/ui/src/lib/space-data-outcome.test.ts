/**
 * Reading a Data-tree outcome correctly (P3.3).
 *
 * Three of the four things that come back are NOT failures, and each needs a
 * different sentence and affordance. The trap this file exists for: an
 * ADAPTER's refusal arrives FLAT because it travels through
 * `invokeOperation`'s passthrough, while core's own refusals are wrapped — and
 * the api client only understands the wrapped shape, so a flat `data_conflict`
 * degrades to `request_failed` and survives only inside `details`.
 */
import { describe, expect, it } from "vitest";
import { describeSpaceDataOutcome } from "./space-data-outcome";

describe("a conflict is an expected outcome, not a failure", () => {
  it("recognizes a WRAPPED conflict", () => {
    expect(
      describeSpaceDataOutcome({ code: "data_conflict", status: 409 }).kind
    ).toBe("conflict");
  });

  it("recognizes a FLAT adapter conflict the api client could not decode", () => {
    // `getApiErrorCode` reads `error.code` only, so this arrives as
    // `request_failed` with the real body tucked into `details`.
    expect(
      describeSpaceDataOutcome({
        code: "request_failed",
        details: { code: "data_conflict", message: "changed" },
        status: 409,
      }).kind
    ).toBe("conflict");
  });

  it("recognizes a conflict from the STATUS alone", () => {
    // Whatever the body managed to carry, 409 is unambiguous.
    expect(describeSpaceDataOutcome({ status: 409 }).kind).toBe("conflict");
  });

  it("carries NO message of its own — the wording is the caller's to translate", () => {
    // The two sentences that are OURS live at the call site, which has a `t`.
    // This module stays pure so the classification can be tested without one.
    expect(describeSpaceDataOutcome({ status: 409 })).toEqual({
      kind: "conflict",
    });
  });
});

describe("an approval must not look like success OR like failure", () => {
  it("recognizes the 202 gate", () => {
    expect(
      describeSpaceDataOutcome({ code: "approval_required", status: 202 })
    ).toEqual({ kind: "approval" });
  });
});

describe("an unsupported gesture keeps the module's own words", () => {
  it("passes the message through, because it names what to do instead", () => {
    const message =
      "Nothing new can be made in Contacts from the data tree — use the module's own action.";
    const outcome = describeSpaceDataOutcome({
      code: "not_supported",
      message,
      status: 405,
    });
    expect(outcome.kind).toBe("unsupported");
    expect(outcome.kind === "unsupported" && outcome.message).toBe(message);
  });
});

describe("everything else is an error", () => {
  it("keeps the message it was given", () => {
    const outcome = describeSpaceDataOutcome({
      message: "Boom",
      status: 500,
    });
    expect(outcome.kind).toBe("error");
    expect(outcome.kind === "error" && outcome.message).toBe("Boom");
  });

  it("survives an error that is not an object at all", () => {
    expect(describeSpaceDataOutcome(undefined).kind).toBe("error");
  });
});
