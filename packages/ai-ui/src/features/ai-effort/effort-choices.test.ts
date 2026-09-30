import { describe, expect, it } from "vitest";
import {
  buildEffortChoiceOptions,
  isEffortRestricted,
  toEffortGrant,
} from "./effort-choices.js";

function allowedValues(allowedEfforts: string[] | null) {
  return buildEffortChoiceOptions(allowedEfforts)
    .filter((option) => option.allowed)
    .map((option) => option.value);
}

describe("buildEffortChoiceOptions", () => {
  it("offers Normal and Extra when the plan places no restriction", () => {
    expect(allowedValues(null)).toEqual(["auto", "normal", "high"]);
    expect(allowedValues([])).toEqual(["auto", "normal", "high"]);
  });

  it("keeps Extra visible but not offered on a Normal-only plan", () => {
    const options = buildEffortChoiceOptions(["normal"]);
    expect(allowedValues(["normal"])).toEqual(["auto", "normal"]);
    expect(options.map((option) => option.value)).toEqual([
      "auto",
      "normal",
      "high",
    ]);
  });

  it("ignores tiers it does not know (the retired low / medium)", () => {
    expect(allowedValues(["normal", "medium"])).toEqual(["auto", "normal"]);
    expect(toEffortGrant(["low"]).allowed_efforts).toBeNull();
  });
});

describe("isEffortRestricted", () => {
  it("is true only when Extra is withheld", () => {
    expect(isEffortRestricted(null)).toBe(false);
    expect(isEffortRestricted(["normal", "high"])).toBe(false);
    expect(isEffortRestricted(["normal"])).toBe(true);
  });
});
