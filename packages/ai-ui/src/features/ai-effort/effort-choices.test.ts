import { describe, expect, it } from "vitest";
import {
  buildEffortChoiceOptions,
  isEffortRestricted,
  resolveEffortChoice,
  toEffortGrant,
} from "./effort-choices.js";

function allowedValues(allowedEfforts: string[] | null) {
  return buildEffortChoiceOptions(allowedEfforts)
    .filter((option) => option.allowed)
    .map((option) => option.value);
}

describe("buildEffortChoiceOptions", () => {
  it("offers every tier when the plan places no restriction", () => {
    expect(allowedValues(null)).toEqual(["auto", "low", "medium", "high"]);
    expect(allowedValues([])).toEqual(["auto", "low", "medium", "high"]);
  });

  it("does not offer high on a plan that grants only low", () => {
    const options = buildEffortChoiceOptions(["low"]);
    expect(allowedValues(["low"])).toEqual(["auto", "low"]);
    // Withheld tiers stay visible (disabled) so the plan boundary is legible.
    expect(options.map((option) => option.value)).toEqual([
      "auto",
      "low",
      "medium",
      "high",
    ]);
    expect(options.find((option) => option.value === "high")?.allowed).toBe(
      false
    );
  });

  it("ignores tiers a newer service invented", () => {
    expect(allowedValues(["low", "extreme"])).toEqual(["auto", "low"]);
    expect(toEffortGrant(["extreme"]).allowed_efforts).toBeNull();
  });
});

describe("resolveEffortChoice", () => {
  it("keeps a granted choice", () => {
    expect(resolveEffortChoice("high", ["low", "medium", "high"])).toBe("high");
    expect(resolveEffortChoice("medium", null)).toBe("medium");
  });

  it("degrades downward rather than refusing", () => {
    expect(resolveEffortChoice("high", ["low"])).toBe("low");
    expect(resolveEffortChoice("high", ["low", "medium"])).toBe("medium");
  });

  it("gives the cheapest granted tier when nothing sits at or below", () => {
    expect(resolveEffortChoice("low", ["high"])).toBe("high");
  });

  it("leaves auto alone — the router sizes it inside the grant", () => {
    expect(resolveEffortChoice("auto", ["low"])).toBe("auto");
  });
});

describe("isEffortRestricted", () => {
  it("is true only when a tier is withheld", () => {
    expect(isEffortRestricted(null)).toBe(false);
    expect(isEffortRestricted(["low", "medium", "high"])).toBe(false);
    expect(isEffortRestricted(["low", "medium"])).toBe(true);
  });
});
