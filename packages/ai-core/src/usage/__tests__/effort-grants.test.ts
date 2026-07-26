import { describe, expect, it } from "vitest";
import {
  ceilingEffort,
  clampEffort,
  isEffortAllowed,
  isEffortUnrestricted,
} from "../effort-grants.js";

describe("isEffortUnrestricted", () => {
  it("treats null, empty and all-garbage lists as unrestricted", () => {
    expect(isEffortUnrestricted({})).toBe(true);
    expect(isEffortUnrestricted({ allowed_efforts: null })).toBe(true);
    expect(isEffortUnrestricted({ allowed_efforts: [] })).toBe(true);
    // A list of nothing recognisable must not lock the tenant out entirely.
    expect(
      isEffortUnrestricted({
        allowed_efforts: ["extreme"] as unknown as never,
      })
    ).toBe(true);
  });
});

describe("isEffortAllowed", () => {
  it("respects an explicit grant", () => {
    const grant = { allowed_efforts: ["low", "medium"] } as const;
    expect(isEffortAllowed("low", grant)).toBe(true);
    expect(isEffortAllowed("high", grant)).toBe(false);
  });

  it("ignores case and whitespace in stored values", () => {
    expect(
      isEffortAllowed("high", {
        allowed_efforts: [" HIGH "] as unknown as never,
      })
    ).toBe(true);
  });
});

describe("clampEffort", () => {
  it("passes a granted tier through untouched", () => {
    expect(clampEffort("medium", { allowed_efforts: ["low", "medium"] })).toBe(
      "medium"
    );
  });

  it("degrades downward rather than refusing", () => {
    // A plan boundary should be a tier, not an error: the request is already
    // paid for by the time we know the tier is too high.
    expect(clampEffort("high", { allowed_efforts: ["low", "medium"] })).toBe(
      "medium"
    );
    expect(clampEffort("high", { allowed_efforts: ["low"] })).toBe("low");
  });

  it("gives the cheapest granted tier when nothing sits below the request", () => {
    expect(clampEffort("low", { allowed_efforts: ["high"] })).toBe("high");
  });

  it("is a no-op when unrestricted", () => {
    expect(clampEffort("high", {})).toBe("high");
  });
});

describe("ceilingEffort", () => {
  it("reports the highest granted tier for the router to size against", () => {
    expect(ceilingEffort({ allowed_efforts: ["low", "medium"] })).toBe(
      "medium"
    );
    expect(ceilingEffort({ allowed_efforts: ["low"] })).toBe("low");
    expect(ceilingEffort({})).toBe("high");
  });
});
